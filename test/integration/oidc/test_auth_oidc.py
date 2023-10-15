"""Integration tests for the CLI shell plugins and runners."""
import html
import os
import re
import subprocess
from string import Template
from typing import ClassVar
import tempfile
from urllib import parse

import requests

from galaxy_test.driver import integration_util
from galaxy_test.base.api import ApiTestInteractor


KEYCLOAK_ADMIN_USERNAME = "admin"
KEYCLOAK_ADMIN_PASSWORD = "admin"
KEYCLOAK_TEST_USERNAME = "gxyuser"
KEYCLOAK_TEST_PASSWORD = "gxypass"
KEYCLOAK_URL = "https://localhost:8443/realms/gxyrealm"


OIDC_BACKEND_CONFIG_TEMPLATE = f"""<?xml version="1.0"?>
<OIDC>
    <provider name="keycloak">
        <url>{KEYCLOAK_URL}</url>
        <client_id>gxyclient</client_id>
        <client_secret>gxytestclientsecret</client_secret>
        <redirect_uri>$galaxy_url/authnz/keycloak/callback</redirect_uri>
        <enable_idp_logout>true</enable_idp_logout>
    </provider>
</OIDC>
"""

def wait_till_keycloak_ready(port):
    return subprocess.call(["timeout", "300", "bash", "-c", f"'until curl --silent --output /dev/null http://localhost:{port}; do sleep 0.5; done'"]) == 0


def start_keycloak_docker(container_name, port=8443, image="keycloak/keycloak:22.0.1"):
    keycloak_realm_data = os.path.dirname(__file__)
    START_SLURM_DOCKER = [
        "docker",
        "run",
        "-h",
        "localhost",
        "-p",
        f"{port}:8443",
        "-d",
        "--name",
        container_name,
        "--rm",
        "-v",
        f"{keycloak_realm_data}:/opt/keycloak/data/import",
        "-e",
        f"KEYCLOAK_ADMIN={KEYCLOAK_ADMIN_USERNAME}",
        "-e",
        f"KEYCLOAK_ADMIN_PASSWORD={KEYCLOAK_ADMIN_PASSWORD}",
        "-e",
        "KC_HOSTNAME_STRICT=false",
        image,
        "start",
        "--optimized",
        "--import-realm",
        "--https-certificate-file=/opt/keycloak/data/import/keycloak-server.crt.pem",
        "--https-certificate-key-file=/opt/keycloak/data/import/keycloak-server.key.pem"
    ]
    print(" ".join(START_SLURM_DOCKER))
    subprocess.check_call(START_SLURM_DOCKER)
    wait_till_keycloak_ready(port)


def stop_keycloak_docker(container_name):
    subprocess.check_call(["docker", "rm", "-f", container_name])


class AbstractTestCases:
    @integration_util.skip_unless_docker()
    class BaseKeycloakIntegrationTestCase(integration_util.IntegrationTestCase):
        container_name: ClassVar[str]

        @classmethod
        def setUpClass(cls):
            # By default, the oidc callback must be done over a secure transport, so
            # we forcibly disable it for now
            cls.disableOauthlibHttps()
            cls.container_name = f"{cls.__name__}_container"
            # start_keycloak_docker(container_name=cls.container_name)
            super().setUpClass()
            # For the oidc callback to work, we need to know Galaxy's hostname and port.
            # However, we won't know what the host and port are until the Galaxy test driver is started.
            # So let it start, then generate the oidc_backend_config.xml with the correct host and port,
            # and finally restart Galaxy so the OIDC config takes effect.
            cls.configure_oidc_and_restart()

        @classmethod
        def generate_oidc_config_file(cls, server_wrapper):
            with tempfile.NamedTemporaryFile('w+t', delete=False) as tmp_file:
                host = server_wrapper.host
                port = server_wrapper.port
                prefix = server_wrapper.prefix or ""
                galaxy_url = f"http://{host}:{port}{prefix.rstrip('/')}"
                data = Template(OIDC_BACKEND_CONFIG_TEMPLATE).safe_substitute(galaxy_url=galaxy_url)
                tmp_file.write(data)
                return tmp_file.name

        @classmethod
        def configure_oidc_and_restart(cls):
            with tempfile.NamedTemporaryFile('w+t', delete=False) as tmp_file:
                server_wrapper = cls._test_driver.server_wrappers[0]
                cls.backend_config_file = cls.generate_oidc_config_file(server_wrapper)
                # Explicitly assign the previously used port, as it's random otherwise
                del os.environ["GALAXY_TEST_PORT_RANDOM"]
                os.environ["GALAXY_TEST_PORT"] = os.environ["GALAXY_WEB_PORT"]
            cls._test_driver.restart(config_object=cls, handle_config=cls.handle_galaxy_oidc_config_kwds)

        @classmethod
        def tearDownClass(cls):
            #stop_keycloak_docker(cls.container_name)
            cls.restoreOauthlibHttps()
            os.remove(cls.backend_config_file)
            super().tearDownClass()

        @classmethod
        def disableOauthlibHttps(cls):
            if "OAUTHLIB_INSECURE_TRANSPORT" in os.environ:
                cls.saved_oauthlib_insecure_transport = os.environ["OAUTHLIB_INSECURE_TRANSPORT"]
            os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "true"
            os.environ["REQUESTS_CA_BUNDLE"] = os.path.dirname(__file__)  + "/keycloak-server.crt.pem"
            os.environ["SSL_CERT_FILE"] = os.path.dirname(__file__)  + "/keycloak-server.crt.pem"

        @classmethod
        def restoreOauthlibHttps(cls):
            if getattr(cls, "saved_oauthlib_insecure_transport", None):
                os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = cls.saved_oauthlib_insecure_transport
            else:
                del os.environ["OAUTHLIB_INSECURE_TRANSPORT"]

        @classmethod
        def handle_galaxy_oidc_config_kwds(cls, config):
            config["enable_oidc"] = True
            config["oidc_config_file"] = os.path.join(os.path.dirname(__file__), "oidc_config.xml")
            config["oidc_backends_config_file"] = cls.backend_config_file

        def _get_interactor(self, api_key=None, allow_anonymous=False) -> "ApiTestInteractor":
            return super()._get_interactor(api_key=None, allow_anonymous=True)


class TestGalaxyOIDCLoginIntegration(AbstractTestCases.BaseKeycloakIntegrationTestCase):

    REGEX_KEYCLOAK_LOGIN_ACTION = re.compile(r"action=\"(.*)\"\s+")

    def _login_via_keycloak(
        self,
        username,
        password,
        expected_codes=[200, 404],
    ):
        session = requests.Session()
        response = session.get(f"{self.url}authnz/keycloak/login")
        provider_url = response.json()["redirect_uri"]        
        response = session.get(provider_url, verify=False)
        matches = self.REGEX_KEYCLOAK_LOGIN_ACTION.search(response.text)
        auth_url = html.unescape(matches.groups(1)[0])
        response = session.post(
            auth_url, data={"username": username, "password": password}, verify=False
        )
        if expected_codes:
            assert response.status_code in expected_codes, response
        self.galaxy_interactor.cookies = session.cookies
        return session, response

    def test_oidc_login(self):
        _, response = self._login_via_keycloak(KEYCLOAK_TEST_USERNAME, KEYCLOAK_TEST_PASSWORD)
        # Should have redirected back if auth succeeded
        parsed_url = parse.urlparse(response.url)
        notification = parse.parse_qs(parsed_url.query)['notification'][0]
        assert "Your Keycloak identity has been linked to your Galaxy account." in notification
        response = self._get("users/current")
        self._assert_status_code_is(response, 200)
        assert response.json()["email"] == "gxyuser@galaxy.org"

    def test_oidc_logout(self):
        # login
        session, response = self._login_via_keycloak(KEYCLOAK_TEST_USERNAME, KEYCLOAK_TEST_PASSWORD)
        # get the user
        response = session.get(self._api_url("users/current"))
        self._assert_status_code_is(response, 200)
        # now logout
        response = session.get(self._api_url("../authnz/logout"))
        response = session.get(response.json()["redirect_uri"], verify=False)
        # make sure we can no longer request the user
        response = session.get(self._api_url("users/current"))
        self._assert_status_code_is(response, 400)

    def test_auth_by_access_token(self):
        # login at least once
        self._login_via_keycloak(KEYCLOAK_TEST_USERNAME, KEYCLOAK_TEST_PASSWORD)
        access_token = self.get_keycloak_access_token()
        response = self._get("users/current", headers={"Authorization": f"Bearer {access_token}"})
        self._assert_status_code_is(response, 200)
        assert response.json()["email"] == "gxyuser@galaxy.org"

    def get_keycloak_access_token(self, username=KEYCLOAK_TEST_USERNAME, password=KEYCLOAK_TEST_PASSWORD):
        data = {
            "client_id": "gxyclient",
            "client_secret": "gxytestclientsecret",
            "grant_type": "password",
            "username": username,
            "password": password
        }
        response = requests.post(f"{KEYCLOAK_URL}/protocol/openid-connect/token", data=data, verify=False)
        return response.json()["access_token"]

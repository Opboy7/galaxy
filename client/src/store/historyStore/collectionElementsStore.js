import { LastQueue } from "utils/promise-queue";
import { urlData } from "components/providers/UrlDataProvider";
import { mergeListing } from "./utilities";

const queue = new LastQueue();

const state = {
    items: [],
    itemKey: "element_index",
    queryCurrent: null,
};

const getters = {
    getCollectionElements: (state) => () => {
        return state.items.filter((n) => n);
    },
};

const actions = {
    fetchCollectionElements: async ({ commit }, { contentsUrl, offset, limit }) => {
        const url = `${contentsUrl}?offset=${offset}&limit=${limit}`;
        queue.enqueue(urlData, { url }).then((payload) => {
            const queryKey = contentsUrl;
            commit("saveCollectionElements", { queryKey, payload });
        });
    },
};

const mutations = {
    saveCollectionElements: (state, { queryKey, payload }) => {
        mergeListing(state, { queryKey, payload });
    },
};

export const collectionElementsStore = {
    state,
    getters,
    actions,
    mutations,
};

define(["mvc/list/list-view","mvc/history/history-model","mvc/history/history-contents","mvc/history/history-preferences","mvc/history/hda-li","mvc/history/hdca-li","mvc/user/user-model","mvc/ui/error-modal","ui/fa-icon-button","mvc/base-mvc","utils/localization","ui/search-input"],function(a,b,c,d,e,f,g,h,i,j,k){"use strict";var l=a.ModelListPanel,m=l.extend({_logNamespace:"history",HDAViewClass:e.HDAListItemView,HDCAViewClass:f.HDCAListItemView,collectionClass:c.HistoryContents,modelCollectionKey:"contents",tagName:"div",className:l.prototype.className+" history-panel",emptyMsg:k("This history is empty"),noneFoundMsg:k("No matching datasets found"),searchPlaceholder:k("search datasets"),initialize:function(a){l.prototype.initialize.call(this,a),this.linkTarget=a.linkTarget||"_blank"},_createDefaultCollection:function(){return new this.collectionClass([],{history:this.model})},freeModel:function(){return l.prototype.freeModel.call(this),this.model&&this.model.clearUpdateTimeout(),this},_setUpListeners:function(){l.prototype._setUpListeners.call(this),this.on({error:function(a,b,c,d,e){this.errorHandler(a,b,c,d,e)},"loading-done":function(){this.render(),this.views.length||this.trigger("empty-history",this)},"views:ready view:attached view:removed":function(){this._renderSelectButton()}})},FETCH_COLLECTION_COUNTS_DELAY:2e3,loadHistory:function(a,c,d){d=_.extend(d||{silent:!0}),this.info("loadHistory:",a,c,d);var e=this;return e.setModel(new b.History({id:a})),e.trigger("loading"),e.model.fetchWithContents(c,d).done(function(){_.delay(function(){e.model.contents.fetchCollectionCounts()},e.FETCH_COLLECTION_COUNTS_DELAY)}).always(function(){e.trigger("loading-done")})},refreshContents:function(a){return this.model?this.model.refresh(a):$.when()},_setUpCollectionListeners:function(){return l.prototype._setUpCollectionListeners.call(this),this.listenTo(this.collection,{"fetching-more":this.showContentsLoadingIndicator,"fetching-more-done":this.hideContentsLoadingIndicator})},_buildNewRender:function(){var a=l.prototype._buildNewRender.call(this);return this._renderSelectButton(a),a},_renderEmptyMessage:function(a){var b=this,c=b.$emptyMessage(a),d=b.model.get("contents_active").active<=0;return d?c.empty().append(b.emptyMsg).show():b.searchFor&&b.model.contents.haveSearchDetails()&&!b.views.length?c.empty().append(b.noneFoundMsg).show():$()},_renderSelectButton:function(a){if(a=a||this.$el,!this.multiselectActions().length)return null;if(!this.views.length)return this.hideSelectors(),a.find(".controls .actions .show-selectors-btn").remove(),null;var b=a.find(".controls .actions .show-selectors-btn");return b.length?b:i({title:k("Operations on multiple datasets"),classes:"show-selectors-btn",faIcon:"fa-check-square-o"}).prependTo(a.find(".controls .actions"))},_showLoadingIndicator:function(a,b){var c=$('<div class="loading-indicator"/>');this.$el.html(c.text(a).show(_.isUndefined(b)?this.fxSpeed:b))},_hideLoadingIndicator:function(a){this.$(".loading-indicator").hide(_.isUndefined(a)?this.fxSpeed:a,function(){$(this).remove()})},showContentsLoadingIndicator:function(a){a=_.isNumber(a)?a:this.fxSpeed,this.$emptyMessage().hide();var b=this.$(".contents-loading-indicator");return b.size()?b.stop().clearQueue():(b=$(this.templates.contentsLoadingIndicator({},this)).hide(),b.insertAfter(this.$list()).slideDown(a))},hideContentsLoadingIndicator:function(a){a=_.isNumber(a)?a:this.fxSpeed,this.$("> .contents-loading-indicator").slideUp({duration:100,complete:function(){$(this).remove()}})},renderItems:function(a){a=a||this.$el;var b=this,c=b.$list(a);$(".tooltip").remove(),b.freeViews(),c.empty();var d=b._filterCollection();if(d.length)if(d.length<1e3)b.views=b._renderSomeItems(d,c);else{var e=250;_.range(Math.ceil(d.length/e)).forEach(function(a){var f=a*e,g=Math.min(f+e,d.length)-1,h=d.slice(f,g);_.defer(function(){b.views=b.views.concat(b._renderSomeItems(h,c))})})}return b._renderEmptyMessage(a).toggle(!d.length),b.trigger("views:ready",b.views),b.views},_renderSomeItems:function(a,b){var c=this,d=c._modelsToViews(a);return b.append(d.map(function(a){return a.el.children.length?a.delegateEvents().$el:c._renderItemView$el(a)})),d},_filterItem:function(a){var b=this,c=b.model.contents;return(c.includeHidden||!a.hidden())&&(c.includeDeleted||!a.isDeletedOrPurged())&&l.prototype._filterItem.call(b,a)},_getItemViewClass:function(a){var b=a.get("history_content_type");switch(b){case"dataset":return this.HDAViewClass;case"dataset_collection":return this.HDCAViewClass}throw new TypeError("Unknown history_content_type: "+b)},_getItemViewOptions:function(a){var b=l.prototype._getItemViewOptions.call(this,a);return _.extend(b,{linkTarget:this.linkTarget,expanded:this.model.contents.storage.isExpanded(a.id),hasUser:this.model.ownedByCurrUser()})},_setUpItemViewListeners:function(a){var b=this;return l.prototype._setUpItemViewListeners.call(b,a),b.listenTo(a,{expanded:function(a){b.model.contents.storage.addExpanded(a.model)},collapsed:function(a){b.model.contents.storage.removeExpanded(a.model)}})},collapseAll:function(){this.model.contents.storage.clearExpanded(),l.prototype.collapseAll.call(this)},getSelectedModels:function(){var a=l.prototype.getSelectedModels.call(this);return a.historyId=this.collection.historyId,a},events:_.extend(_.clone(l.prototype.events),{"click .show-selectors-btn":"toggleSelectors","click .messages [class$=message]":"clearMessages"}),toggleShowDeleted:function(a,b){a=void 0!==a?a:!this.model.contents.includeDeleted;var c=this,d=c.model.contents;d.setIncludeDeleted(a,b),c.trigger("show-deleted",a);var e=a?d.fetchDeleted({silent:!0}):jQuery.when();return e.done(function(){c.renderItems()}),a},toggleShowHidden:function(a,b,c){a=void 0!==a?a:!this.model.contents.includeHidden;var d=this,e=d.model.contents;e.setIncludeHidden(a,c),d.trigger("show-hidden",a);var f=a?e.fetchHidden({silent:!0}):jQuery.when();return f.done(function(){d.renderItems()}),a},_firstSearch:function(a){var b=this,c="> .controls .search-input",d=b.model.contents.length;return this.log("onFirstSearch",a),b.model.contents.haveSearchDetails()?void b.searchItems(a):(b.$(c).searchInput("toggle-loading"),void b.model.contents.progressivelyFetchDetails({silent:!0}).progress(function(a,c,e){e+a.length<=d&&b.renderItems()}).always(function(){b.$el.find(c).searchInput("toggle-loading")}).done(function(){b.searchItems(b.searchFor)}))},errorHandler:function(a,b,c){if(!b||0!==b.status||0!==b.readyState){if(this.error(a,b,c),_.isString(a)&&_.isString(b)){var d=a,e=b;return h.errorModal(d,e,c)}return b&&502===b.status?h.badGatewayErrorModal():h.ajaxErrorModal(a,b,c)}},clearMessages:function(a){var b=_.isUndefined(a)?this.$messages().children('[class$="message"]'):$(a.currentTarget);return b.fadeOut(this.fxSpeed,function(){$(this).remove()}),this},scrollToHid:function(a){return this.scrollToItem(_.first(this.viewsWhereModel({hid:a})))},toString:function(){return"HistoryView("+(this.model?this.model.get("name"):"")+")"}});return m.prototype.templates=function(){var a=j.wrapTemplate(["<div>",'<div class="controls"></div>','<ul class="list-items"></ul>','<div class="empty-message infomessagesmall"></div>',"</div>"]),b=j.wrapTemplate(['<div class="controls">','<div class="title">','<div class="name"><%- history.name %></div>',"</div>",'<div class="subtitle"></div>','<div class="history-size"><%- history.nice_size %></div>','<div class="actions"></div>','<div class="messages">',"<% if( history.deleted && history.purged ){ %>",'<div class="deleted-msg warningmessagesmall">',k("This history has been purged and deleted"),"</div>","<% } else if( history.deleted ){ %>",'<div class="deleted-msg warningmessagesmall">',k("This history has been deleted"),"</div>","<% } else if( history.purged ){ %>",'<div class="deleted-msg warningmessagesmall">',k("This history has been purged"),"</div>","<% } %>","<% if( history.message ){ %>",'<div class="<%= history.message.level || "info" %>messagesmall">',"<%= history.message.text %>","</div>","<% } %>","</div>",'<div class="tags-display"></div>','<div class="annotation-display"></div>','<div class="search">','<div class="search-input"></div>',"</div>",'<div class="list-actions">','<div class="btn-group">','<button class="select-all btn btn-default"','data-mode="select">',k("All"),"</button>",'<button class="deselect-all btn btn-default"','data-mode="select">',k("None"),"</button>","</div>",'<div class="list-action-menu btn-group">',"</div>","</div>","</div>"],"history"),c=j.wrapTemplate(['<div class="contents-loading-indicator">','<span class="fa fa-2x fa-spin fa-spinner">',"</span></div>"],"history");return _.extend(_.clone(l.prototype.templates),{el:a,controls:b,contentsLoadingIndicator:c})}(),{HistoryView:m}});
//# sourceMappingURL=../../../maps/mvc/history/history-view.js.map
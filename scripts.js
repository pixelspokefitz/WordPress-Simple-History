/*jshint multistr: true */

/*
V2 begins here
*/
var simple_history2 = (function($) {

	var api_base_url = window.ajaxurl + "?action=simple_history_api";

	var debug = function(what) {

		if (typeof what == "object") {
		
			var newWhat = "";
		
			_.each(what, function(val, key) {
				newWhat += key + ": " + val + "\n";
			});
		
			what = newWhat;
		
		}

		$(".SimpleHistoryLogitems__debug").append("<br>" + what);

	};

	var LogRowsCollection = Backbone.Collection.extend({

		initialize: function(models, options) {

			this.mainView = options.mainView;

			$(document).trigger("SimpleHistory:logRowsCollectionInitialize");

		},

		reload: function() {

			this.trigger("reload");
			$(document).trigger("SimpleHistory:logRowsCollectionReload");

			var pager_size = this.mainView.$el.data("pagerSize");
			this.url = api_base_url + "&type=overview&format=html";
			this.url += "&posts_per_page=" + pager_size;

			// Reset some vars
			this.api_args = null;
			this.max_id = null;
			this.min_id = null;
			this.pages_count = null;
			this.total_row_count = null;
			this.page_rows_from = null;
			this.page_rows_to = null;
			this.max_id_first_page = null;

			// Get first page
			// We don't have max_id yet
			var that = this;
			var url_data = {
				paged: 1,
				// here we want to append custom args/data for filters
			};

			// trigger so plugins can modify url parameters
			this.trigger("before_fetch", this, url_data);

			this.fetch({
				reset: true,
				data: url_data,
				// called on 404 and similar
				error: function(collection, response, options) {
					collection.trigger("reloadError");
					$(document).trigger("SimpleHistory:logRowsCollectionReloadError");
				},
				success: function(collection, response, options) {
					collection.trigger("reloadDone");
					$(document).trigger("SimpleHistory:logRowsCollectionReloadDone");
				}
			});

		},

		/*
		 * Parse ajax response to make it fit to format used by backbone
		 */
		parse: function(resp, xhr) {

			if (!resp || !resp.data) {
				alert("Error in response, could not parse");
				return;
			}

			this.api_args = resp.data.api_args;
			this.max_id = resp.data.max_id;
			this.min_id = resp.data.min_id;
			this.pages_count = resp.data.pages_count;
			this.total_row_count = resp.data.total_row_count;
			this.page_rows_from = resp.data.page_rows_from;
			this.page_rows_to = resp.data.page_rows_to;

			// Store first max_id found, since that's the max id we use for
			// all subsequent paginations
			if ( ! this.max_id_first_page ) {

				this.max_id_first_page = this.max_id;
				$(document).trigger("SimpleHistory:logRowsCollectionFirstLoad");

				$(".SimpleHistory__waitingForFirstLoad").addClass("SimpleHistory__waitingForFirstLoad--isLoaded");

			}

			var arrRows = [];
			_.each(resp.data.log_rows, function(row) {
				arrRows.push({
					html: row
				});
			});

			return arrRows;
		}

	});

	var OccasionsLogRowsCollection = Backbone.Collection.extend({

		initialize: function(models, options) {

			this.url = api_base_url + "&type=occasions&format=html";

			this.fetch({
				reset: true,
				data: {
					logRowID: options.logRowID,
					occasionsID: options.occasionsID,
					occasionsCount: options.occasionsCount
				}
			});

		},

		parse: function(resp, xhr) {

			this.api_args = resp.data.api_args;
			this.max_id = resp.data.max_id;
			this.min_id = resp.data.min_id;
			this.pages_count = resp.data.pages_count;
			this.total_row_count = resp.data.total_row_count;
			this.page_rows_from = resp.data.page_rows_from;
			this.page_rows_to = resp.data.page_rows_to;

			var arrRows = [];
			_.each(resp.data.log_rows, function(row) {
				arrRows.push({
					html: row
				});
			});

			return arrRows;
		}

	});

	var OccasionsView = Backbone.View.extend({

		initialize: function() {

			var logRowID = this.attributes.logRow.data("rowId");
			var occasionsCount = this.attributes.logRow.data("occasionsCount");
			var occasionsID = this.attributes.logRow.data("occasionsId");
			
			this.attributes.logRow.addClass("SimpleHistoryLogitem--occasionsOpening");
			
			this.logRows = new OccasionsLogRowsCollection([], {
				logRow: this.attributes.logRow,
				logRowID: logRowID,
				occasionsID: occasionsID,
				occasionsCount: occasionsCount
			});

			this.logRows.on("reset", this.render, this);

			// Trigger event for plugins
			this.logRows.on("reset", function() {
				$(document).trigger("SimpleHistory:logRowsCollectionOccasionsLoaded");
			}, this);

		},

		render: function() {
			
			var $html = $([]);
			
			this.logRows.each(function(model) {
				var $li = $(model.get("html"));
				$li.addClass("SimpleHistoryLogitem--occasion");
				$html = $html.add($li);
			});

			this.$el.html($html);
			
			this.attributes.logRow.removeClass("SimpleHistoryLogitem--occasionsOpening").addClass("SimpleHistoryLogitem--occasionsOpened");

			this.$el.addClass("haveOccasionsAdded");

		}

	});

	var DetailsModel = Backbone.Model.extend({
		url: api_base_url + "&type=single&format=html"
	});

	/**
	 * DetailsView is a modal popup thingie with all info about a LogRow
	 */
	var DetailsView = Backbone.View.extend({

		initialize: function(attributes) {

			this.model.fetch({
				data: {
					id: this.model.get("id")
				}
			});

			this.template = $("#tmpl-simple-history-logitems-modal").html();
			this.show();
			
			this.listenTo(this.model, "change", this.render);

			// also close on esc
			var view = this;
			$(document).on("keydown.simplehistory.modal", function(e) {
				if (e.keyCode == 27) {
					view.close();
				}
			});

		},

		events: {
			"click .SimpleHistory-modal__background": "close",
			"click .SimpleHistory-modal__contentClose": "close"
		},

		show: function() {

			var $modalEl = $(".SimpleHistory-modal");
			
			if (!$modalEl.length) {
				$modalEl = $(this.template);
				$modalEl.appendTo("body");
			}

			this.setElement($modalEl);
	
			var $modalContentEl = $modalEl.find(".SimpleHistory-modal__content");
			$modalContentEl.addClass("SimpleHistory-modal__content--enter");

			// Force repaint before adding active class
			var offsetHeight = $modalContentEl.get(0).offsetHeight;
			$modalContentEl.addClass("SimpleHistory-modal__content--enter-active");

		},

		close: function() {
			
			var $modalContentEl = this.$el.find(".SimpleHistory-modal__content");
			$modalContentEl.addClass("SimpleHistory-modal__content--leave");
			
			// Force repaint before adding active class
			var offsetHeight = $modalContentEl.get(0).offsetHeight;
			
			$modalContentEl.addClass("SimpleHistory-modal__content--leave-active");
			this.$el.addClass("SimpleHistory-modal__leave-active");

			// Cleanup
			var view = this;
			setTimeout(function() {
				view.$el.remove();
				$(document).off("keyup.simplehistory.modal");
				view.remove();
				Backbone.history.navigate("overview");
			}, 400);

		},

		render: function() {
			
			var $modalContentInnerEl = this.$el.find(".SimpleHistory-modal__contentInner");
			var logRowLI = this.model.get("data").log_rows[0];
			$modalContentInnerEl.html(logRowLI);

		}

	});

	var RowsView = Backbone.View.extend({
	
		initialize: function() {
			
			this.collection.on("reset", this.render, this);
			this.collection.on("reload", this.onReload, this);
			this.collection.on("reloadDone", this.onReloadDone, this);

			// Trigger event for plugins
			this.collection.on("reset", function() {
				$(document).trigger("SimpleHistory:logLoaded");
			}, this);

		},

		onReload: function() {

			$("html").addClass("SimpleHistory-isLoadingPage");

		},

		onReloadDone: function() {

			$("html").removeClass("SimpleHistory-isLoadingPage");
		
		},

		events: {
			"click .SimpleHistoryLogitem__occasions a": "showOccasions",
			"click .SimpleHistoryLogitem__permalink": "permalink"
		},

		permalink: function(e) {

			// If cmd is pressed then don't show modal because then user wants
			// to open modal in new window/tab
			if (e.metaKey) {
				return true;
			}

			e.preventDefault();

			var $target = $(e.target);
			var $logRow = $target.closest(".SimpleHistoryLogitem");
			var logRowID = $logRow.data("rowId");
			
			Backbone.history.navigate("item/" + logRowID, { trigger: true });

		},

		showOccasions: function(e) {

			e.preventDefault();

			var $target = $(e.target);
			var $logRow = $target.closest(".SimpleHistoryLogitem");
			var $occasionsElm = $("<li class='SimpleHistoryLogitem__occasionsItemsWrap'><ul class='SimpleHistoryLogitem__occasionsItems'/></li>");
			
			$logRow.after($occasionsElm);

			this.occasionsView = new OccasionsView({
				el: $occasionsElm.find(".SimpleHistoryLogitem__occasionsItems"),
				attributes: {
					logRow: $logRow
				}
			});

		},

		render: function() {

			var html = "";
			this.collection.each(function(model) {
				html += model.get("html");
			});
			
			this.$el.html( html );

		}

	});

	var PaginationView = Backbone.View.extend({

		initialize: function() {
			
			this.template = $("#tmpl-simple-history-logitems-pagination").html();

			$(document).keydown({ view: this }, this.keyboardNav);

			this.collection.on("reset", this.render, this);

		},

		events: {
			"click .SimpleHistoryPaginationLink": "navigateArrow",
			"keyup .SimpleHistoryPaginationCurrentPage": "navigateToPage",
			"keydown": "keydown"
		},

		keyboardNav: function(e) {

			// if modal with details is open then don't nav away
			if ($(".SimpleHistory-modal").length) {
				return;
			}

			// Only go on if on own page
			if (!$(".dashboard_page_simple_history_page").length) {
				return;
			}

			var paged;

			if (e.keyCode == 37) {
				// prev page
				paged = +e.data.view.collection.api_args.paged - 1;
			} else if (e.keyCode == 39) {
				// next page
				paged = +e.data.view.collection.api_args.paged + 1;
			}

			if (paged) {
				e.data.view.fetchPage(paged);
			}

		},

		navigateToPage: function(e) {

			// keycode 13 = enter
			if (e.keyCode == 13) {
				
				var $target = $(e.target);
				var paged = parseInt( $target.val() );

				// We must go to a page more than zero and max total_row_count
				if (paged < 1) {
					paged = 1;
				}

				if ( paged > this.collection.pages_count ) {
					paged = this.collection.pages_count;
				}

				this.fetchPage(paged);

			}

		},

		navigateArrow: function(e) {
			
			e.preventDefault();
			var $target = $(e.target);

			// if link has class disabled then don't nav away
			if ($target.is(".disabled")) {
				return;
			}

			// direction = first|prev|next|last
			var direction = $target.data("direction");

			var paged;
			switch (direction) {

				case "first":
					paged = 1;
					break;

				case "last":
					paged = this.collection.pages_count;
					break;

				case "prev":
					paged = +this.collection.api_args.paged - 1;
					break;

				case "next":
					paged = +this.collection.api_args.paged + 1;
					break;

			}

			this.fetchPage(paged);
			
		},

		/**
		 * Fetch a page from the server
		 * Calls collection.fetch with the page we want to view as argument
		 */
		fetchPage: function(paged) {

			$("html").addClass("SimpleHistory-isLoadingPage");

			// nav = fetch collection items again
			this.collection.fetch({
				reset: true,
				data: {
					paged: paged,
					max_id_first_page: this.collection.max_id_first_page
				},
				success: function() {
					$("html").removeClass("SimpleHistory-isLoadingPage");
				}
			});

			// Scroll to top of el
			$("html, body").animate({
				scrollTop: this.attributes.mainView.$el.offset().top - 85
			}, 350);

		},

		render: function() {

			var compiled = _.template(this.template);
			
			this.$el.html( compiled({
				min_id: this.collection.min_id,
				max_id: this.collection.max_id,
				pages_count: this.collection.pages_count,
				total_row_count: this.collection.total_row_count,
				page_rows_from: this.collection.page_rows_from,
				page_rows_to: this.collection.page_rows_to,
				api_args: this.collection.api_args,
				strings: simple_history_script_vars.pagination
			}) );

		}

	});

	var MainView = Backbone.View.extend({
		
		el: ".SimpleHistoryGui",

		manualInitialize: function() {

			// Don't try to init if our element does not exist
			if (!this.$el.length) {
				return;
			}

			this.logRouter = new LogRouter();
			Backbone.history.start();

			this.addNeededElements();

			this.logRowsCollection = new LogRowsCollection([], {
				mainView: this,
			});
			
			this.rowsView = new RowsView({
				el: this.$el.find(".SimpleHistoryLogitems"),
				collection: this.logRowsCollection
			});

			$(document).trigger("SimpleHistory:mainViewInitBeforeLoadRows");

			// Load log first time
			this.logRowsCollection.reload();

			$(document).trigger("SimpleHistory:mainViewInitAfterLoadRows");

			this.paginationView = new PaginationView({
				el: this.$el.find(".SimpleHistoryLogitems__pagination"),
				collection: this.logRowsCollection,
				attributes: {
					mainView: this
				}
			});

			$(document).trigger("SimpleHistory:init");

		},

		/**
		 * Add the elements needed for the GUI
		 */
		addNeededElements: function() {

			var template = $("#tmpl-simple-history-base").html();
			this.$el.html( template );

		},


	});

	var LogRouter = Backbone.Router.extend({

		routes: {
			"item/:number": "item",
			'*default': 'default'
		},

		item: function(logRowID) {
			
			var detailsModel = new DetailsModel({
				id: logRowID
			});

			var detailsView = new DetailsView({
				model: detailsModel
			});

		},

		default: function() {

			return false;

		}

	});

	var mainView = new MainView();

	// Init MainView on domReady
	// This is to make sure dropins and plugins have been loaded
	$(document).ready(function() {
		
		mainView.manualInitialize();
		
	});

	return mainView;

})(jQuery);

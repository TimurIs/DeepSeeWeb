/**
 * Base widget class factory
 */
(function() {
    'use strict';

    function BaseWidgetFact($rootScope, Lang, Connector, Filters, Utils) {

        function BaseWidget($scope) {
            var _this = this;
            this.drillLevel      = 0;
            this.drills          = [];
            this.drillsMDX       = [];
            this.storedData      = [];
            this.titles          = [];
            this.baseTitle       = $scope.item.title;
            this.drillFilter     = "";

            if ($scope.tile) {
                $scope.item = {};
                Utils.merge($scope.item, $scope.tile);
            }
            if ($scope.item) this.desc = $scope.getDesc($scope.item.idx);
            var firstRun = true;
            this.supported = true;


            // Setup for actions
            $scope.item.acItems = [];

            // Setup for datasource choser
            $scope.item.dsItems = [];
            $scope.item.dsLabel = "";
            $scope.item.dsSelected = "";
            if (_this.desc && _this.desc.dataSource) $scope.item.dsSelected = Utils.removeExt(_this.desc.dataSource.split("/").pop());
            $scope.onDataSourceChange = onDataSourceChange;
            $scope.item.drillUp = drillUp;
            $scope.performAction = performAction;

            this.customColSpec = "";
            this.customRowSpec = "";
            this.customDataSource = "";
            this.pivotData = null;
            this.linkedMdx = "";
            this.hasDatasourceChoser = false;
            this.hasActions = false;
            this.getDrillMDX = getDrillMDX;
            this._onRequestError = onRequestError;
            this._retrieveData = function(){};
            this._retriveDataSource = onDataSourceReceived;
            this.doDrill = doDrill;
            this.onDrilldownReceived = onDrilldownReceived;
            this.onInit = function(){};
            this.getMDX = getMDX;
            this.clearError = clearError;
            this.showError = showError;
            this.hideToolbar = hideToolbar;
            this.showToolbar = showToolbar;
            this.requestData = requestData;
            this.updateFiltersText = updateFiltersText;
            this.getFilter = getFilter;
            this.isLinked = isLinked;
            this.hasDependents = hasDependents;
            this.broadcastDependents = broadcastDependents;
            this.destroy = destroy;
            this.getDrillTitle = getDrillTitle;
            this.drillUp = drillUp;
            this.liveUpdateInterval = null;
            this.onResize = function(){};

            //this.liveUpdateInterval = setInterval(_this.requestData, 5000);
            // Find refresh controls with timeout
            if (_this.desc && _this.desc.controls) {

                var colSpec = _this.desc.controls.filter(function (ctrl) {
                    return ctrl.action === "setColumnSpec";
                });
                if (colSpec.length !== 0) _this.customColSpec = colSpec[0].targetProperty;

                var refreshers = _this.desc.controls.filter(function (ctrl) {
                    return ctrl.action === "refresh" && parseInt(ctrl.timeout) > 0;
                });
                if (refreshers.length !== 0) {
                    // Use only one
                    this.liveUpdateInterval = setInterval(_this.requestData, parseInt(refreshers[0].timeout) * 1000);
                }
            }

            $scope.item.toolbarView = 'src/views/filters.html';
            $scope.$on('$destroy', function () { _this.destroy(); });
            $scope.$on('drillFilter:' + _this.desc.name, onDrillFilter);
            $scope.$on('drillFilter:*', onDrillFilter);

            if (this.filterCount === undefined) {
                Object.defineProperty(this, "filterCount", {
                    get: function () {
                        return $scope.model.filters.length;
                    }
                });
            }
            if (this.isLinked()) $scope.$on("setLinkedMDX:" + _this.desc.key, onSetLinkedMdx);
            if (this.hasDependents()) $scope.$on("widget:" + _this.desc.key + ":refreshDependents", onRefreshDependents);

            setupChoseDataSource();
            setupActions();
            requestPivotData();

            function onDrillFilter(sc, path) {
                _this.drillFilter = path;
                _this.requestData();
            }

            function performAction(action) {
                if (action.action === 'setColumnSpec') {
                    _this.customColSpec = action.targetProperty;
                    _this.requestData();
                }
            }

            function getDrillTitle(path, name, category) {
                var p = path.split(".");
                p.pop();
                return (_this.baseTitle ? (_this.baseTitle + " - ") : "") + (name ? (p[p.length - 1] + " - ") : "") + (name || category)
            }

            function doDrill(path, name, category) {
                var mdx = _this.getDrillMDX(path);
                if (!mdx) return;
                _this.drillLevel++;
                _this.drills.push(path);
                var p = path.split(".");
                p.pop();
                if (p[p.length - 1] && (name || category)) {
                    _this.titles.push($scope.item.title);
                    $scope.item.title = _this.getDrillTitle(path, name, category);
                }
                _this.broadcastDependents(mdx);
                _this.drillsMDX.push(mdx);
                Connector.execMDX(mdx).error(_this._onRequestError).success(_this.onDrilldownReceived);
            }

            /**
             * Makes drillup
             */
            function drillUp() {
                _this.clearError();
                _this.storedData.pop();
                var data = _this.storedData.pop();
                $scope.item.backButton = _this.storedData.length !== 0;

                _this._retrieveData(data);
                doDrillUp();
            }

            /**
             * Callback for drilldown data request
             * @param {object} result Drilldown data
             */
            function onDrilldownReceived(result) {
                if (!result) return;
                if ($scope.chartConfig) $scope.chartConfig.loading = false;
                if (result.Error) {
                    _this.showError(result.Error);
                    return;
                }

                if (result.Data.length === 0) {
                    doDrillUp();
                    return;
                }
                var hasValue = false;
                for (var i = 0; i < result.Data.length; i++) if (result.Data[i]) {
                    hasValue = true;
                    break;
                }
                if (!hasValue) return;

                $scope.item.backButton = true;
                _this._retrieveData(result);
            }

            /**
             * Back button click handler
             */
            function doDrillUp() {
                _this.drillLevel--;
                _this.drills.pop();
                _this.drillsMDX.pop();
                _this.broadcastDependents(_this.drillsMDX[_this.drillsMDX.length - 1]);
                var tit = _this.titles.pop();
                if (!tit) $scope.item.title = _this.baseTitle; else $scope.item.title = tit;
            }


            /**
             * Returns MDX for drilldown
             * @param {string} path Drilldown path
             * @returns {string} Drilldown MDX
             */
            function getDrillMDX(path) {
                var pos = path.indexOf("&");
                var p = path.substr(0, pos) + "Members";

                var mdx = _this.getMDX();

                if (path === "") {
                    mdx = mdx.replace(" ON 1 FROM", " .children ON 1 FROM");
                    return mdx;
                }

                // Remove all functions
                // TODO: dont replace %Label
                var match = mdx.match(/ON 0,(.*)ON 1/);
                if (match && match.length === 2) {
                    var str = match[1];
                    var isNonEmpty = str.indexOf("NON EMPTY") !== -1;
                    mdx = mdx.replace(str, (isNonEmpty ? "NON EMPTY " : " ") + p + " ");
                }

                var customDrill = "";
                if (_this.pivotData) {
                    var drilldownSpec = "";
                    if (_this.pivotData.rowAxisOptions) if (_this.pivotData.rowAxisOptions.drilldownSpec) drilldownSpec = _this.pivotData.rowAxisOptions.drilldownSpec;
                    if (drilldownSpec) {
                        var drills = drilldownSpec.split("^");
                        if (drills.length !== 0) {
                            if (drills[_this.drillLevel]) customDrill = drills[_this.drillLevel];
                            for (var i = 0; i < _this.drills.length; i++) {
                                if (drills[i]) mdx += " %Filter " + _this.drills[i];
                            }
                        }
                    }
                }
                if (customDrill) {
                    var match = mdx.match(/ON 0,(.*)ON 1/);
                    if (match && match.length === 2) {
                        var str = match[1];
                        var newstr = str.replace(p, customDrill);
                        mdx = mdx.replace(str, newstr);
                    } else mdx = mdx.replace(re, customDrill);
                } else {
                    if (mdx.indexOf(p) === -1) {
                        match =  mdx.match(/SELECT(.*)ON 1/);
                        if (match && match.length === 2) {
                            var str = match[1];
                            var isNonEmpty = str.indexOf("NON EMPTY") !== -1;
                            mdx = mdx.replace(str, (isNonEmpty ? " NON EMPTY " : " ") + path + ".Children" + " ");
                        }
                    } else mdx = mdx.replace(p, path + ".Children");
                }
                if (_this.drillFilter) {
                    mdx = mdx + " %FILTER " + _this.drillFilter;
                }
                mdx = mdx + " %FILTER " + path;
                return mdx;
            }

            /**
             * Changes current datasource
             * @param {string} pivot Pivot name
             */
            function changeDataSource(pivot) {
                if (pivot)
                    _this.customDataSource = pivot;
                else
                    _this.customDataSource = "";
                requestPivotData();
            }

            /**
             * Change current row spec
             * @param {string} path Path
             */
            function changeRowSpec(path) {
                console.log(path);
                if (!path) _this.customRowSpec = ""; else _this.customRowSpec = path;
                _this.requestData();
            }

            /**
             * Setup action buttons for widget. Received from controls
             */
            function setupActions() {
                if (!_this.desc.controls || _this.desc.controls.length === 0) return;
                var actions = _this.desc.controls.filter(function(el) { return el.action === 'setColumnSpec' && el.type !== "hidden"; });
                if (actions.length === 0) return;
                _this.hasActions = true;
                showToolbar();
                $scope.item.acItems = actions;
                // Filters.isFiltersOnToolbarExists = true;
            }

            /**
             * Event handler for datasource list intem change
             * @param item
             */
            function onDataSourceChange(item) {
                var sel, val, idx;
                sel = $scope.item.dsSelected;
                if (sel) {
                    idx = item.labels.indexOf(sel);
                    if (idx !== -1) val = item.values[idx];
                }
                switch (item.action) {
                    case 'chooseDataSource': changeDataSource(val); break;
                    case 'chooseRowSpec': changeRowSpec(val); break;
                }
            }
            /**
             * Will setup datasource choser. If widget has control chooseDataSource
             */
            function setupChoseDataSource() {
                if (!_this.desc) return;

                function getSetter(item) {
                    return function(data) {
                        if (data.data && typeof data.data === "object") {
                            for (var prop in data.data) if (data.data[prop] === _this.desc.dataSource) { $scope.item.dsSelected = prop; }
                            item.labels = [];
                            item.values = [];
                            for (var k in data.data) {
                                item.labels.push(k);
                                item.values.push(data.data[k]);
                            }
                        }
                    }
                }

                if (!_this.desc.controls || _this.desc.controls.length === 0) return;
                var chosers = _this.desc.controls.filter(function(el) { return el.action === 'chooseDataSource' || el.action === 'chooseRowSpec'; });
                if (chosers.length === 0) return;
                _this.hasDatasourceChoser = true;
                $scope.item.dsItems = [];
                for (var i = 0; i < chosers.length; i++) {
                    var prop = chosers[i].targetProperty;
                    if (!prop) continue;
                    var a = prop.split(".");
                    a.pop();
                    prop = a.join(".");
                    var item = {
                        action: chosers[i].action,
                        label: chosers[i].label || Lang.get("dataSource")
                    };
                    $scope.item.dsItems.push(item);
                    Connector.getTermList(prop).then(getSetter(item));
                }
                showToolbar();
            }

            /**
             * Callback for $on(":refreshDependents"). Sends refresh broadcast to all dependent widgets
             */
            function onRefreshDependents() {
                _this.broadcastDependents();
            }

            /**
             * Updates linked mdx query. Used when widget is linked to another. Callback for $on(":setLinkedMDX")
             * @param {object} sc Scope
             * @param {string} mdx MDX to set
             */
            function onSetLinkedMdx(sc, mdx) {
                $scope.item.backButton = false;
                if (_this.storedData) _this.storedData = [];
                _this.linkedMdx = mdx;
                _this.requestData();
            }

            /**
             * Returns linked widget
             * @returns {object} Linked widget
             */
            function isLinked() {
                if (!_this.desc) return false;
                return _this.desc.Link;
            }

            /**
             * Check if widget has dependents
             * @returns {boolean} true if widget has dependents
             */
            function hasDependents() {
                if (!_this.desc) return 0;
                if (!_this.desc.dependents) return 0;
                return _this.desc.dependents.length !== 0;
            }

            /**
             * Get widget filter
             * @param {number} idx Index of filter to get
             * @returns {object} Widget filter
             */
            function getFilter(idx) {
                return Filters.getFilter($scope.model.filters[idx].idx);
            }

            function requestPivotData() {
                var ds = _this.customDataSource || _this.desc.dataSource;
                if (ds) Connector.getPivotData(ds).error(_this._onRequestError).success(_this._retriveDataSource);
            }

            function onDataSourceReceived(data) {
                if (!_this) return;
                _this.pivotData = data;
                if (_this.customDataSource) {
                    _this.desc.mdx = data.mdx;
                    _this.requestData();
                }
            }

            /**
             * Request widget data
             */
            function requestData() {
                if (!_this.supported) return;
                $scope.item.backButton = false;
                $scope.item.title = _this.baseTitle;
                _this.drillLevel = 0;
                _this.drills = [];
                var mdx = _this.getMDX();
                if (mdx === "") return;
                _this.clearError();
                if (!firstRun) broadcastDependents();
                firstRun = false;
                Connector.execMDX(mdx).error(_this._onRequestError).success(_this._retrieveData);
            }

            /**
             * Update mdx on dependent widgets
             * @param {string|undefined} customMdx MDX that will be set on all dependent widgets
             */
            function broadcastDependents(customMdx) {
                if (_this.hasDependents()) {
                    for (var i = 0; i < _this.desc.dependents.length; i++) {
                        $rootScope.$broadcast("setLinkedMDX:" + _this.desc.dependents[i], customMdx || _this.getMDX());
                    }
                }
            }

            /**
             * Process request error for widget
             * @param e
             * @param {number} status Error code
             */
            function onRequestError(e, status) {
                if ($scope.chartConfig) $scope.chartConfig.loading = false;
                var msg = Lang.get("errWidgetRequest");
                switch (status) {
                    case 401: msg = Lang.get('errUnauth'); break;
                    case 404: msg = Lang.get('errNotFound'); break;
                }
                _this.showError(msg);
            }


            function checkColSpec(mdx) {
                if (_this.customColSpec) {
                    var match = mdx.match(/ON 0,(.*)ON 1/);
                    if (match && match.length === 2) {
                        var str = match[1];
                        var isNonEmpty = str.indexOf("NON EMPTY") !== -1;
                        mdx = mdx.replace(str, (isNonEmpty ? "NON EMPTY " : " ") + _this.customColSpec + " ");
                    }
                }
                return mdx;
            }
            /**
             * Return widget MDX depending on active filters
             * @returns {string}
             */
            function getMDX() {
                var filterActive = false;
                var i;
                var flt;
                var path;

                // If widget is linked, use linkedMDX
                if (_this.isLinked()) {
                    var str = _this.linkedMdx;
                    str = checkColSpec(str);
                    return str;
                }

                // Check for active filters on widget
                var filters = Filters.getWidgetFilters(_this.desc.name);
                // Add filter for drillFilter feature
                if (_this.drillFilter) {
                    var parts = _this.drillFilter.split("&");
                    filters.push({
                        targetProperty: parts[0].slice(0, -1),
                        value: "&" + parts[1]
                    });
                }
                for (i = 0; i < filters.length; i++) {
                    flt = filters[i];
                    if (flt.value !== "" || flt.isInterval) {
                        filterActive = true;
                        break;
                    }
                }
                var mdx = _this.desc.mdx;
                if (!mdx) console.warn("Widget without MDX");

                if (_this.customRowSpec) {
                    var match = mdx.match(/ON 0,(.*)ON 1/);
                    if (match.length === 2) {
                        var str = match[1];
                        var isNonEmpty = str.indexOf("NON EMPTY") !== -1;
                        mdx = mdx.replace(str, (isNonEmpty ? "NON EMPTY " : " ") + _this.customRowSpec + " ");
                    }
                }

                mdx = checkColSpec(mdx);

                // Don't use filters in widgets placed on tiles
                // TODO: fix this
                if (!filterActive || _this.desc.tile) return mdx;

                // Find all interval filters
                var where = "";
                for (i = 0; i < filters.length; i++) {
                    flt = filters[i];
                    if (!flt.isInterval) continue;
                    path = flt.targetProperty;
                    var v1 = flt.values[flt.fromIdx].path.replace("&[", "").replace("]", "");
                    var v2 = flt.values[flt.toIdx].path.replace("&[", "").replace("]", "");
                    where += " %SEARCH.&[(" + path + " >= '" + v1 + "') AND (" + path + " <= '" + v2 + "')]";
                }

                // Find other filters
                for (i = 0; i < filters.length; i++) {
                    flt = filters[i];
                    if (flt.value !== "" && !flt.isInterval) {
                        var bracket = "{";
                        if (flt.isExclude) bracket = "(";
                        var values = flt.value.toString().split("|");
                        path = flt.targetProperty;
                        if (flt.isExclude)
                            mdx += " %FILTER " + bracket;
                        else
                            mdx += " %FILTER %OR(" + bracket;
                        for (var j = 0; j < values.length; j++) {
                            if (flt.isExclude)
                                mdx += path + "." + values[j] + ".%NOT,";
                            else
                                mdx += path + "." + values[j] + ",";
                        }
                        bracket = "}";
                        if (flt.isExclude) bracket = ")";
                        mdx = mdx.substr(0, mdx.length - 1) + " " + bracket;
                        if (!flt.isExclude) mdx += ")";
                    }
                }

                // Inserting "where" condition in appropriate part of mdx request
                if (where) {
                    var m = mdx.toUpperCase();
                    var pos = m.indexOf("WHERE");
                    if (pos === -1) {
                        // Where not exists, it should be before %FILTER
                        pos = m.indexOf("%FILTER");
                        if (pos === -1) mdx += " WHERE " + where; else mdx = mdx.slice(0, pos) + " WHERE " + where + " " + mdx.slice(pos);
                    } else {
                        // Insert in exists condition
                        mdx = mdx.slice(0, pos) + " " + where + " AND " + mdx.slice(pos);
                    }
                }

                return mdx;
            }

            /**
             * Update displayed text on filter input controls, depending on active filters
             */
            function updateFiltersText() {
                for (var i = 0; i < _this.filterCount; i++) {
                    var flt = _this.getFilter(i);
                    if (flt.isInterval) {
                        $scope.model.filters[i].text = flt.values[flt.fromIdx].name + ":" + flt.values[flt.toIdx].name;
                        continue;
                    }
                    $scope.model.filters[i].text = ((flt.isExclude === true && flt.valueDisplay) ? (Lang.get("not") + " ") : "") + flt.valueDisplay;
                }
            }

            /**
             * Show widget toolbar
             */
            function showToolbar() {
                $scope.item.toolbar = true;
            }

            /**
             * Hide widget toolbar
             */
            function hideToolbar() {
                $scope.item.toolbar = false;
            }

            /**
             * Clears error message on widget holder
             */
            function clearError() {
                $scope.model.error = "";
            }

            /**
             * Display error message on widget holder
             * @param {string} txt
             */
            function showError(txt) {
                $scope.model.error = txt;
            }

            /**
             * Called before widget was destroyed
             */
            function destroy() {
                // Removing interval updates of widget
                if (_this.liveUpdateInterval) clearInterval(_this.liveUpdateInterval);
                _this.liveUpdateInterval = null;

                _this = null;
            }
        }

        return BaseWidget;
    }

    angular.module('widgets')
        .factory('BaseWidget', ['$rootScope', 'Lang', 'Connector', 'Filters', 'Utils', BaseWidgetFact]);

})();
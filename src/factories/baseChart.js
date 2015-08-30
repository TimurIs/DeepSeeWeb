/**
 * Base chart class factory
 */
(function() {
    'use strict';

    function BaseChartFact(Lang, Utils, Connector, $timeout, CONST, Storage) {

        function BaseChart($scope) {
            this.storedData          = [];
            this.addSeries           = addSeries;
            this.setType             = setType;
            this.getMinValue         = getMinValue;
            this.enableStacking      = enableStacking;
            this.baseRequestData     = this.requestData;
            this.requestData         = reqestData;
            this.parseData           = parseMultivalueData;
            this.onResize            = onResize;
            this._retrieveData       = retrieveData;
            this.onDrilldownReceived = onDrilldownReceived;
            this.getDrillMDX         = getDrillMDX;

            var _this    = this;
            var firstRun = true;
            var settings = Storage.getAppSettings();

            $scope.item.isLegend = true;
            var widgetsSettings = Storage.getWidgetsSettings();
            if (widgetsSettings[_this.desc.key]) {
                if (widgetsSettings[_this.desc.key].isLegend !== undefined)  $scope.item.isLegend = widgetsSettings[_this.desc.key].isLegend;
            }
            widgetsSettings = null;

            $scope.item.isChart = true;
            $scope.item.displayAsPivot = displayAsPivot;
            $scope.item.toggleLegend = toggleLegend;
            $scope.item.drillUp = drillUp;
            $scope.$on("print:" + $scope.item.$$hashKey, function(){ if (_this.chart) _this.chart.print();});
            $scope.chartConfig = {
                options: {
                    legend: {
                        enabled: $scope.item.isLegend
                    },
                    navigation: {
                        buttonOptions: {
                            align: 'center'
                        }
                    },
                    chart: {
                        type: 'line'
                    },
                    credits: {
                        enabled: false
                    },
                    tooltip: {
                        formatter: defaultFormatter
                    },
                    exporting: {
                        enabled: false
                    },
                    plotOptions: {
                        series: {
                            cursor: "pointer",
                            point: {
                                events: {
                                    click: onPointClick
                                }
                            }
                        }
                    }
                },
                yAxis: {
                    title: {
                        text: ""
                    }
                },
                xAxis: {
                    title: {
                        text: ""
                    }
                },
                series: [],
                title: {
                    text: ''
                },
                func: function (chart) {
                    _this.chart = chart;
                    $timeout(function() {
                        if (!_this) return;
                        if (_this.chart) _this.chart.reflow();
                    }, 0);
                },

                loading: true
            };

            if (_this.desc.inline) {
                $scope.chartConfig.options.chart.backgroundColor = null;
                $scope.chartConfig.options.plotOptions ={
                    series: {
                        enableMouseTracking: false
                    }
                };
                $scope.chartConfig.options.legend = {
                    enabled: false
                };

                if (_this.desc.tile) {
                     var opt = {
                        xAxis: {
                            labels: {
                                style: {
                                    color: settings.isMetro ? CONST.fontColorsMetro[_this.desc.tile.fontColor] : CONST.fontColors[_this.desc.tile.fontColor]
                                }
                            }
                        },
                        yAxis: {
                         labels: {
                             style: {
                                 color: settings.isMetro ? CONST.fontColorsMetro[_this.desc.tile.fontColor] : CONST.fontColors[_this.desc.tile.fontColor]
                             }
                         }
                        }
                    };
                    Utils.merge($scope.chartConfig, opt);
                }
            }

            /**
             * Callback for point click. Used to do drilldown
             * @param {object} e Event
             */
            function onPointClick(e) {
                if (!e.point) return;
                $scope.chartConfig.loading = true;
                var mdx = _this.getDrillMDX(e.point.path);
                _this.broadcastDependents(mdx);
                Connector.execMDX(mdx).error(_this._onRequestError).success(_this.onDrilldownReceived);
            }

            /**
             * Callback for drilldown data request
             * @param {object} result Drilldown data
             */
            function onDrilldownReceived(result) {
                if (!result) return;
                $scope.chartConfig.loading = false;
                if (result.Error) {
                    _this.showError(result.Error);
                    return;
                }

                if (result.Data.length === 0) return;
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
             * Makes drillup
             */
            function drillUp() {
                _this.clearError();
                _this.storedData.pop();
                var data = _this.storedData.pop();
                $scope.item.backButton = _this.storedData.length !== 0;
                _this._retrieveData(data);
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
                mdx = mdx.replace(p, path + ".Children");

                //var pos = str.indexOf(" ON 0,");
                //if (pos == -1) pos = 1;
                //var row = str.substring(pos + 6, str.indexOf(" ON 1"));
                /*if (widget) {
                    var drilldownSpec = "";
                    if (widget.pivotData) if (widget.pivotData.rowAxisOptions) if (widget.pivotData.rowAxisOptions.drilldownSpec) drilldownSpec = widget.pivotData.rowAxisOptions.drilldownSpec;
                    if (drilldownSpec) {
                        var drills = drilldownSpec.split("^");
                        if (drills.length != 0) {
                            if (drills[widget.drillLevel]) customDrill = drills[widget.drillLevel];
                            for (var i = 0; i < widget.drills.length; i++) {
                                if (drills[i]) str += " %Filter " + widget.drills[i];
                            }
                        }
                    }
                }
                if (customDrill) {
                    str = str.replace(row, customDrill);
                    str += " %Filter " + path;
                } else*/
                //str = str.replace(row, path + ".Children");
                mdx = mdx + " %FILTER " + path;
                return mdx;
            }

            /**
             * Toggles chart legend and save state in storage
             */
            function toggleLegend() {
                $scope.item.isLegend = !$scope.item.isLegend;
                var widgetsSettings = Storage.getWidgetsSettings();
                if (!widgetsSettings[_this.desc.key]) widgetsSettings[_this.desc.key] = {};
                widgetsSettings[_this.desc.key].isLegend = $scope.item.isLegend;
                Storage.setWidgetsSettings(widgetsSettings);
                if (_this.chart) {
                    if ($scope.item.isLegend) _this.chart.legendShow(); else _this.chart.legendHide();
                }
                $scope.chartConfig.legend = {enabled: $scope.item.isLegend};
            }

            /**
             * Displays chart as pivot widget
             */
            function displayAsPivot() {
                if (_this.desc.type === "pivot") {
                    delete $scope.item.pivotMdx;
                    _this.desc.type = _this.desc.oldType;
                    $scope.$broadcast("typeChanged");
                } else {
                    _this.desc.oldType = _this.desc.type;
                    _this.desc.type = "pivot";
                    $scope.item.pivotMdx = _this.getMDX();
                    $scope.$broadcast("typeChanged");
                }
            }

            /**
             * Default formatter for chart values
             * @returns {string} Formatted value
             */
            function defaultFormatter() {
                /* jshint ignore:start */
                var t = this;
                /* jshint ignore:end */
                var fmt = t.series.options.format;
                var val = t.y;
                if (fmt) val = numeral(val).format(fmt.replace(/;/g, ""));
                var a = t.point.name + '<br>' + t.series.name + ': <b>' + val + "</b><br>";
                if (t.point.percentage) a += parseFloat(t.point.percentage).toFixed(2).toString() + "%";
                return a;
            }

            /**
             * Requests chart data
             */
            function reqestData() {
                $scope.chartConfig.loading = true;
                _this.baseRequestData();
            }

            /**
             * Callback for chart data request
             * @param {object} result chart data
             */
            function retrieveData(result) {
                if (!_this) return;
                $scope.chartConfig.loading = false;
                if (result.Error) {
                    _this.showError(result.Error);
                    return;
                }
                _this.storedData.push(result);
                if (result) {
                    /*
                     this is fix for incorrect minimum value calculation in bar chart
                     if minimum is 1, highcharts will set it and values are not visible
                     we must set it to zero, to fix this issue
                     */
                    var min = _this.getMinValue(result.Data);
                    if (min > 0 && min <= 10) $scope.chartConfig.yAxis.currentMin = 0;
                    if (!result.Cols) return;

                    if (result.Cols[0].tuples.length === 0) {
                        // cerate default count parameter
                        if (result.Data.length !== 0) result.Cols[0].tuples.push({caption: Lang.get("count")});
                    }
                    _this.parseData(result);
                    if (_this.desc.type.toLowerCase() === "combochart") {
                        $scope.chartConfig.yAxis = [{},{ opposite: true}];
                        $scope.chartConfig.options.yAxis = [{},{}];
                        for (var i = 0; i < $scope.chartConfig.series.length; i++) {
                            switch (i % 3) {
                                case 0: $scope.chartConfig.series[i].type="line";$scope.chartConfig.series[i].zIndex = 2; $scope.chartConfig.series[i].color ="#000000"; break;
                                case 1: $scope.chartConfig.series[i].type="bar"; $scope.chartConfig.series[i].yAxis = 1;$scope.chartConfig.series[i].color = 'rgb(124, 181, 236)';$scope.chartConfig.series[i].zIndex = 0; break;
                                case 2: $scope.chartConfig.series[i].type="area"; break;
                            }
                            $scope.chartConfig.yAxis[i].title = {
                                text: $scope.chartConfig.series[i].name
                            };
                        }
                    }
                    if (firstRun) {
                        firstRun = false;
                        _this.onResize();
                    }
                }
            }

            /**
             * Adds series to chart
             * @param {object} data Series data
             */
            function addSeries(data) {
                var cols = Highcharts.getOptions().colors;
                data.color = cols[$scope.chartConfig.series.length % cols.length];
                //if (!data.id) data.id = $scope.chartConfig.series.length + 1;
                $scope.chartConfig.series.push(data);
            }

            /**
             * Enables chart stacking
             */
            function enableStacking() {
                var ex = {
                    plotOptions: {
                        series: {
                            stacking: 'normal'
                        }
                    }
                };
                Utils.merge($scope.chartConfig.options, ex);
            }

            /**
             * Set chart type
             * @param {string} type Chart type
             */
            function setType(type) {
                $scope.chartConfig.options.chart.type = type;
            }

            /**
             * Fix data. Removes empty values
             * @param {Array} tempData Data
             */
            function fixData(tempData) {
                for (var g = 0; g < tempData.length; g++) {
                    if (!tempData[g].y) tempData[g].y = null;
                    if (tempData[g].y === "" || tempData[g].y === undefined) tempData[g].y = null;
                }
            }

            /**
             * Returns minimum value of data array
             * @param {Array} data Data
             * @returns {Number} Minimum value
             */
            function getMinValue(data) {
                var min = Infinity;
                for (var i = 0; i < data.length; i++) {
                    if (data[i] < min) min = data[i];
                }
                return min;
            }

            /**
             * Parse data and create chart series
             * @param {object} d Data
             */
            function parseMultivalueData(d) {
                var data = d;
                var i;
                $scope.chartConfig.yAxis.min = getMinValue(data.Data);
                $scope.chartConfig.series = [];
                $scope.chartConfig.xAxis.categories = [];
                if (data.Cols[1].tuples.length === 0) {
                    //TODO: lang
                    data.Cols[1].tuples.push({caption: Lang.get("count")});
                }
                for (i = 0; i < data.Cols[1].tuples.length; i++) {
                    $scope.chartConfig.xAxis.categories.push(data.Cols[1].tuples[i].caption.toString());
                }
                var tempData = [];
                var hasChildren = false;
                if (data.Cols[0].tuples.length !== 0) if (data.Cols[0].tuples[0].children && data.Cols[0].tuples[0].children.length !== 0) hasChildren = true;
                if (hasChildren) {
                    var k = 0;
                    for(var t = 0; t < data.Cols[0].tuples.length; t++) {
                        for (var c = 0; c < data.Cols[0].tuples[t].children.length; c++) {
                            tempData = [];
                            for (var g = 0; g < data.Cols[1].tuples.length; g++) {
                                tempData.push({
                                    y: data.Data[data.Cols[0].tuples.length * data.Cols[0].tuples[t].children.length * g + t * data.Cols[0].tuples[t].children.length + c],
                                    cube: data.Info.cubeName,
                                    drilldown: true,
                                    path: data.Cols[0].tuples[t].path
                                });
                                k++;
                            }
                            fixData(tempData);
                            _this.addSeries({
                                data: tempData,
                                name: data.Cols[0].tuples[t].caption + "/" + data.Cols[0].tuples[t].children[c].caption,
                                format: data.Cols[0].tuples[t].children[c].format
                            });
                        }
                    }
                    /*for(var t = 0; t < data.Cols[0].tuples.length; t++) {
                        for (var c = 0; c < data.Cols[0].tuples[t].children.length; c++) {
                            tempData = [];
                            for (var da = 0; da < data.Cols[1].tuples.length; da++) {
                                tempData.push({
                                    y: data.Data[data.Cols[0].tuples.length * data.Cols[0].tuples[t].children.length * da + t * data.Cols[0].tuples[t].children.length + c],
                                    cube: data.Info.cubeName,
                                    path: data.Cols[0].tuples[t].path
                                });
                                k++;
                            }
                            fixData(tempData);
                            _this.addSeries({
                                data: tempData,
                                name: data.Cols[0].tuples[t].caption + "/" + data.Cols[0].tuples[t].children[c].caption,
                                format: data.Cols[0].tuples[t].children[c].format
                            });
                        }
                    }*/
                } else {
                    //for(var j = 0; j < data.Cols[0].tuples.length; j++) {
                    for(var j = data.Cols[0].tuples.length - 1; j>=0; j--) {
                        tempData = [];
                        for (i = 0; i < data.Cols[1].tuples.length; i++) {
                            tempData.push({
                                y: data.Data[i * data.Cols[0].tuples.length + j],
                                drilldown: true,
                                cube: data.Info.cubeName,
                                path: data.Cols[1].tuples[i].path,
                                name: data.Cols[1].tuples[i].caption
                            });
                        }
                        fixData(tempData);
                        var name = Lang.get("count");
                        var format = "";
                        if (data.Cols[0].tuples[j]) {
                            name = data.Cols[0].tuples[j].caption;
                            format = data.Cols[0].tuples[j].format;
                        }

                        _this.addSeries({
                            data: tempData,
                            name: name,
                            format: format
                        });
                    }
                }
            }

            /**
             * Callback for resize event
             */
            function onResize() {
                if (_this.chart) if (_this.chart.container) if (_this.chart.container.parentNode) _this.chart.setSize(_this.chart.container.parentNode.offsetWidth, _this.chart.container.parentNode.offsetHeight, false);
            }
        }

        return BaseChart;
    }

    angular.module('widgets')
        .factory('BaseChart', ['Lang', 'Utils', 'Connector', '$timeout', 'CONST', 'Storage', BaseChartFact]);

})();
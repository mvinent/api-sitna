﻿TC.control = TC.control || {};

if (!TC.control.Measure) {
    TC.syncLoadJS(TC.apiLocation + 'TC/control/Measure');
}

TC.control.DrawMeasureModify = function () {
    var self = this;

    TC.control.Measure.apply(self, arguments);

    self._dialogDiv = TC.Util.getDiv(self.options.dialogDiv);
    if (window.$) {
        self._$dialogDiv = $(self._dialogDiv);
    }
    if (!self.options.dialogDiv) {
        document.body.appendChild(self._dialogDiv);
    }

    const cs = self._classSelector = '.' + self.CLASS;
    self._selectors = {
        ELEVATION_CHECKBOX: cs + '-dialog-elev input[type=checkbox]'
    };

    self.persistentDrawControls = true;

    self.renderPromise().then(function () {
        self._1stCoordText = self.div.querySelector('.tc-ctl-meas-val-coord-1-t');
        self._2ndCoordText = self.div.querySelector('.tc-ctl-meas-val-coord-2-t');
        self._1stCoordValue = self.div.querySelector('.tc-ctl-meas-val-coord-1-v');
        self._2ndCoordValue = self.div.querySelector('.tc-ctl-meas-val-coord-2-v');
        self._elevationText = self.div.querySelector('.tc-ctl-meas-val-coord-ele-t');
        self._elevationValue = self.div.querySelector('.tc-ctl-meas-val-coord-ele-v');
    });

};

TC.inherit(TC.control.DrawMeasureModify, TC.control.Measure);

(function () {
    var ctlProto = TC.control.DrawMeasureModify.prototype;

    ctlProto.CLASS = 'tc-ctl-dmm';

    var _dataKeys = {
        VALUE: 'tcValue'
    };

    var downloadDialog = null;


    TC.Consts.event.RESULTSPANELCLOSE = TC.Consts.event.RESULTSPANELCLOSE || 'resultspanelclose.tc';
    TC.Consts.event.FEATURESSELECT = TC.Consts.event.FEATURESSELECT || "featuresselect.tc";

    const elevationProfileCache = [];

    const getElevationProfileFromCache = function (feature) {
        return elevationProfileCache.filter(function (elm) {
            return elm.feature === feature;
        })[0];
    };

    const cacheElevationProfile = function (feature, data) {
        var result = getElevationProfileFromCache(feature);
        if (!result) {
            result = {
                feature: feature
            };
            elevationProfileCache.push(result);
        }
        result.data = data;
        return result;
    };

    const removeElevationProfileFromCache = function (feature) {
        const featIdx = elevationProfileCache.reduce(function (prev, cur, idx) {
            if (cur.feature === feature) {
                return idx;
            }
            return prev;
        }, -1);
        if (featIdx >= 0) {
            elevationProfileCache.splice(featIdx, 1);
        }
    };

    const clearElevationProfileCache = function () {
        elevationProfileCache.length = 0;
    };

    ctlProto.template = TC.apiLocation + "TC/templates/DrawMeasureModify.html";        

    ctlProto.render = function (callback) {
        const self = this;
        const promise = self._set1stRenderPromise(TC.control.Measure.prototype.render.call(self, function () {
            self._clearBtn = self.div.querySelector('.tc-ctl-dmm-cmd button.tc-ctl-dmm-btn-clr');
            self._clearBtn.addEventListener(TC.Consts.event.CLICK, function (e) {
                TC.confirm(self.getLocaleString('deleteAll.confirm'), function () {
                    self.clear();
                });
            });
            self._downloadBtn = self.div.querySelector('.tc-ctl-dmm-cmd button.tc-ctl-dmm-btn-dl');
            self._downloadBtn.addEventListener(TC.Consts.event.CLICK, function (e) {
                self.showSketchDownloadDialog();
            });

            self._elevProfileBtn = self.div.querySelector('.tc-ctl-meas-prof-btn');
            self._elevProfileBtn.addEventListener(TC.Consts.event.CLICK, function (e) {
                self.elevationProfileActive ? self.deactivateElevationProfile() : self.activateElevationProfile();
            });

            if (!self.options.displayElevation) {
                self._elevProfileBtn.style.display = 'none';
            }

            if (TC.Util.isFunction(callback)) {
                callback();
            }
        }));

        const renderOptions = {
            checkboxId: self.getUID(),
            elevation: self.options.displayElevation
        };
        
        return promise;
    };

    ctlProto.register = function (map) {
        const self = this;
        return new Promise(function (resolve, reject) {
            TC.control.Measure.prototype.register.call(self, map).then(function () {
                const pointDrawControlId = self.getUID();
                const modifyId = self.getUID();

                const elevationPromise = new Promise(function (resolve, reject) {
                    if (self.options.displayElevation) {
                        self.elevationProfileActive = true;
                        TC.loadJS(
                            !TC.tool || !TC.tool.Elevation,
                            TC.apiLocation + 'TC/tool/Elevation',
                            function () {
                                const elevationOptions = typeof self.options.displayElevation === 'boolean' ? {} : self.options.displayElevation;
                                self.elevation = new TC.tool.Elevation(elevationOptions);
                                resolve(self.elevation);
                            }
                        );
                    }
                    else if (self.map.elevation) {
                        self.elevation = self.map.elevation;
                        resolve(self.elevation);
                    }
                    else
                        resolve();
                });
                
                Promise.all([self.layerPromise, self.renderPromise(), elevationPromise]).then(function (objects) {
                    const layer = objects[0];
                    layer.title = self.getLocaleString('sketch');

                    self._modifyPromise = map.addControl('modify', {
                        id: modifyId,
                        div: self.div.querySelector('.' + self.CLASS + '-mod'),
                        layer: layer
                    });

                    self._modifyPromise.then(function (modify) {

                        self.modify = modify;
                        modify
                            .on(TC.Consts.event.FEATURESSELECT, function (e) {
                                if (self.resultsPanelChart && !e.features.some(function (feature) {
                                    return self.resultsPanelChart.currentFeature === feature;
                                })) {
                                    self.resultsPanelChart.setCurrentFeature(null);
                                }
                                const feature = e.features[e.features.length - 1];
                                if (feature) {
                                    self.showMeasures(self.getFeatureMeasureData(feature));
                                    const style = feature._originalStyle || feature.getStyle();
                                    switch (true) {
                                        case TC.feature.Polygon && feature instanceof TC.feature.Polygon:
                                            self.displayMode(TC.Consts.geom.POLYGON);
                                            self.polygonDrawControl
                                                .setStrokeColorWatch(style.strokeColor)
                                                .setStrokeWidthWatch(style.strokeWidth);
                                            break;
                                        case TC.feature.Polyline && feature instanceof TC.feature.Polyline:
                                            self.displayMode(TC.Consts.geom.POLYLINE);
                                            self.lineDrawControl
                                                .setStrokeColorWatch(style.strokeColor)
                                                .setStrokeWidthWatch(style.strokeWidth);
                                            const profile = getElevationProfileFromCache(feature);
                                            if (profile) {
                                                self.resultsPanelChart.setCurrentFeature(feature);
                                                self.renderElevationChart(profile.data);
                                            }
                                            break;
                                        case TC.feature.Point && feature instanceof TC.feature.Point:
                                            self.displayMode(TC.Consts.geom.POINT);
                                            self.pointDrawControl
                                                .setStrokeColorWatch(style.strokeColor)
                                                .setStrokeWidthWatch(style.strokeWidth);
                                            break;
                                        default:
                                            break;
                                    }
                                    self.modify
                                        .setFontColorWatch(style.fontColor)
                                        .setFontSizeWatch(style.fontSize);
                                }
                            })
                            .on(TC.Consts.event.FEATURESUNSELECT, function (e) {
                                const features = self.modify.getSelectedFeatures();
                                if (!features.length) {
                                    self.resetDrawWatches();
                                }
                                self.resetElevationProfile();
                                if (self.resultsPanelChart) {
                                    self.resultsPanelChart.close();
                                }
                            })
                            .on(TC.Consts.event.FEATUREMODIFY, function (e) {
                                if (e.layer === self.layer) {
                                    removeElevationProfileFromCache(e.feature);
                                    const setMeasures = function (feature) {
                                        const measureData = self.getFeatureMeasureData(feature);
                                        self.showMeasures(measureData);
                                        self.setFeatureMeasureData(feature);
                                    };
                                    setMeasures(e.feature);

                                    // Si es un punto metemos la elevación en la geometría (porque la mostramos en las medidas)
                                    if (self.options.displayElevation && TC.feature.Point && e.feature instanceof TC.feature.Point) {
                                        self.elevation.setGeometry({
                                            features: [e.feature],
                                            crs: self.map.crs
                                        }).then(function (features) {
                                            setMeasures(features[0]);
                                        });
                                    }

                                    const popups = self.map.getControlsByClass('TC.control.Popup');
                                    popups.forEach(function (pu) {
                                        if (pu.currentFeature === e.feature && pu.isVisible()) {
                                            pu.hide();
                                        }
                                    });
                                }
                            });

                        map
                            .on(TC.Consts.event.CONTROLDEACTIVATE, function (e) {
                                const control = e.control;
                                if (control === self.modify) {
                                    self.resetDrawWatches();
                                    self.resetElevationProfile();
                                    if (self.resultsPanelChart) {
                                        self.resultsPanelChart.setCurrentFeature(null);
                                        self.resultsPanelChart.close();
                                    }
                                }
                                else if (control === self.lineDrawControl) {
                                    self.resetElevationProfile();
                                    if (self.resultsPanelChart) {
                                        self.resultsPanelChart.close();
                                    }
                                }
                            })
                            .on(TC.Consts.event.POPUP, function (e) {
                                // En líneas queremos mostrar el perfil en vez del popup
                                const feature = e.control.currentFeature;
                                if (TC.feature.Polyline && feature instanceof TC.feature.Polyline && self.layer.features.indexOf(feature) >= 0) {
                                    if (self.elevationProfileActive) {
                                        e.control.hide();
                                        if (self.resultsPanelChart) {
                                            self.resultsPanelChart.setCurrentFeature(feature);
                                        }
                                        const profile = getElevationProfileFromCache(feature);
                                        if (self.resultsPanelChart) {
                                            self.resultsPanelChart.currentFeature = feature;
                                            if (self.resultsPanelChart.isMinimized()) {
                                                self.resultsPanelChart.maximize();
                                            }
                                        }
                                        if (profile) {
                                            self.renderElevationChart(profile.data);
                                        }
                                        else {
                                            self.displayElevationProfile(feature.geometry);
                                        }
                                    }
                                }
                            })
                            .on(TC.Consts.event.PROJECTIONCHANGE, function (e) {
                                if (self.elevationChartData) {
                                    self.elevationChartData.coords = TC.Util.reproject(self.elevationChartData.coords, e.oldCrs, e.newCrs);
                                }
                            });

                    });

                    self._lineDrawControlPromise.then(function (lineDrawControl) {
                        lineDrawControl
                            .on(TC.Consts.event.DRAWSTART, function () {
                                //self.resetElevationProfile();
                                if (self.resultsPanelChart && self.resultsPanelChart.currentFeature) {
                                    self.resultsPanelChart.setCurrentFeature(null);
                                }
                                self.resetValues();
                            })
                            .on(TC.Consts.event.DRAWUNDO + ' ' + TC.Consts.event.DRAWREDO, function () {
                                const lineDrawControl = this;
                                self.displayElevationProfile(lineDrawControl.history.slice(0, lineDrawControl.historyIndex));
                            })
                            .on(TC.Consts.event.DRAWEND, function (e) {
                                if (self.resultsPanelChart) {
                                    self.resultsPanelChart.currentFeature = e.feature;
                                }
                            })
                            .on(TC.Consts.event.POINT, function (e) {
                                const lineDrawControl = this;
                                const coords = lineDrawControl.history.slice(0, lineDrawControl.historyIndex);
                                const lastCoord = coords[coords.length - 1];
                                if (lastCoord[0] !== e.point[0] || lastCoord[1] !== e.point[1]) {
                                    coords.push(e.point);
                                }
                                self.displayElevationProfile(coords);
                            })
                            .on(TC.Consts.event.STYLECHANGE, function (e) {
                                self.onStyleChange(e);
                            });
                    });

                    self._polygonDrawControlPromise.then(function (polygonDrawControl) {
                        polygonDrawControl
                            .on(TC.Consts.event.DRAWSTART, function () {
                                self.resetValues();
                            })
                            //.on(TC.Consts.event.DRAWEND, function (e) {
                            //    if (self.options.displayElevation) {
                            //        self.elevation.setGeometry({
                            //            features: [e.feature],
                            //            crs: self.map.crs
                            //        });
                            //    }
                            //})
                            .on(TC.Consts.event.STYLECHANGE, function (e) {
                                self.onStyleChange(e);
                            });
                    });

                    self._pointDrawControlPromise = map.addControl('draw', {
                        id: pointDrawControlId,
                        div: self.div.querySelector('.' + TC.control.Measure.prototype.CLASS + '-point'),
                        mode: TC.Consts.geom.POINT,
                        persistent: self.persistentDrawControls,
                        styleTools: true,
                        layer: self.layer
                    });

                    self._pointDrawControlPromise.then(function (pointDrawControl) {

                        pointDrawControl.containerControl = self;
                        self.drawControls.push(pointDrawControl);
                        self.pointDrawControl = pointDrawControl;

                        self.resetValues();

                        pointDrawControl
                            .on(TC.Consts.event.DRAWEND, function (e) {
                                const updateChanges = function (feat) {
                                    self.showMeasures({ coords: feat.geometry, units: map.wrap.isGeo() ? 'degrees' : 'm' });
                                    self.setFeatureMeasureData(feat);
                                };
                                updateChanges(e.feature);
                                if (self.options.displayElevation) {
                                    self.elevation.setGeometry({
                                        features: [e.feature],
                                        crs: self.map.crs
                                    }).then(function (features) {
                                        updateChanges(features[0]);
                                    })
                                }
                            })
                            .on(TC.Consts.event.DRAWCANCEL, function (e) {
                                // Alerta de condición de carrera si no ponemos un timeout:
                                // 1- Se llama a cancel de un control Draw.
                                // 2- Se llama a deactivate (como es mediante cancel, no se se corta la cadena de activación controles).
                                // 3- Si el control activo anterior era otro de los modos de dibujo de Measure, se activa.
                                // 4- Se llama a cancel desde aquí.
                                // 5- Se llama a deactivate del control que acabamos de activar en 3.
                                // El activate de 3 y el deactivate de 5 sobre el mismo control entran en condición de carrera al crear/destruir la interaction
                                // por tanto se puede quedar en un estado inconsistente. Para evitar eso, separamos 3 de 5 por el siguiente timeout.
                                setTimeout(function () {
                                    self.cancel();
                                }, 100);
                            })
                            .on(TC.Consts.event.STYLECHANGE, function (e) {
                                self.onStyleChange(e);
                            });
                        // Desactivamos el método exportState que ya se encarga el control padre de ello
                        pointDrawControl.exportsState = false;
                    });

                    self.setMode(self.options.mode);

                    map
                        .on(TC.Consts.event.FEATUREADD, function (e) {
                            const layer = e.layer;
                            const feature = e.feature;
                            if (layer === self.layer) {
                                self.setFeatureMeasureData(feature);
                                
                                self._modifyPromise.then(function (modify) {
                                    modify.displayLabelText(feature.getStyle().label);
                                });
                                self._clearBtn.disabled = false;
                                self._downloadBtn.disabled = false;
                            }
                        })
                        .on(TC.Consts.event.FEATUREREMOVE + ' ' + TC.Consts.event.FEATURESCLEAR, function (e) {
                            const layer = e.layer;
                            const feature = e.feature;
                            if (layer === self.layer) {
                                if (self.layer.features.length === 0) {
                                    self._clearBtn.disabled = true;
                                    self._downloadBtn.disabled = true;
                                    self.resetValues();
                                    clearElevationProfileCache();
                                }
                                else if (feature) {
                                    removeElevationProfileFromCache(feature);
                                }
                            }
                        })
                        .on(TC.Consts.event.RESULTSPANELCLOSE, function (e) {
                            const control = e.control;
                            if (control.setCurrentFeature) {
                                control.setCurrentFeature(null);
                            }
                        });

                    resolve(self);
                });

            }).catch(function (error) {
                reject(error);
            });
        });
    };

    ctlProto.displayMode = function (mode) {
        const self = this;
        if (mode === TC.Consts.geom.POINT) {
            self._activeMode = self.div.querySelector('.tc-ctl-meas-pt');
        }
        if (self.modify) {
            self.modify.div.classList.remove(TC.Consts.classes.COLLAPSED);
        }
        return TC.control.Measure.prototype.displayMode.call(self, mode);
    };

    ctlProto.setMode = function (mode) {
        const self = this;
        if (mode === TC.Consts.geom.POINT) {
            self.pointDrawControl.activate();
        }
        return TC.control.Measure.prototype.setMode.call(self, mode);
    };

    ctlProto.setFeatureMeasureData = function (feature) {
        const self = this;
        const data = {};
        switch (true) {
            case TC.feature.Point && feature instanceof TC.feature.Point:
                const firstCoordText = self._1stCoordText.innerHTML;
                const secondCoordText = self._2ndCoordText.innerHTML;
                const elevationText = self._elevationText.innerHTML;
                if (self._1stCoordValue.textContent.trim().length > 0 && self._2ndCoordValue.textContent.trim().length > 0) {
                    data.CRS = self.map.crs;
                    data[firstCoordText.substr(0, firstCoordText.indexOf(':'))] = parseFloat(self._1stCoordValue.dataset.value);
                    data[secondCoordText.substr(0, secondCoordText.indexOf(':'))] = parseFloat(self._2ndCoordValue.dataset.value);
                    if (elevationText) {
                        data[self.getLocaleString('ele')] = parseFloat(self._elevationValue.dataset.value);
                    }
                    feature.setData(data);
                }
                break;
            case TC.feature.Polyline && feature instanceof TC.feature.Polyline:
                if (self._len.innerHTML.trim() !== self.NOMEASURE) {
                    data[self.getLocaleString('2dLength')] = self._len.innerHTML;
                    feature.setData(data);
                }
                break;
            case TC.feature.Polygon && feature instanceof TC.feature.Polygon:
                if (self._area.innerHTML.trim() !== self.NOMEASURE && self._peri.innerHTML.trim() !== self.NOMEASURE) {
                    data[self.getLocaleString('area')] = self._area.innerHTML;
                    data[self.getLocaleString('2dPerimeter')] = self._peri.innerHTML;
                    feature.setData(data);
                }
                break;
            default:
                break;
        }
        return self;
    };

    ctlProto.getFeatureMeasureData = function (feature) {
        const self = this;
        const result = {
            units: 'm'
        };
        const measureOptions = {};
        if (self.map.wrap.isGeo()) {
            measureOptions.crs = TC.Cfg.utmCrs;
        }
        switch (true) {
            case TC.feature.Polygon && feature instanceof TC.feature.Polygon:
                result.area = feature.getArea(measureOptions);
                result.perimeter = feature.getLength(measureOptions);
                break;
            case TC.feature.Polyline && feature instanceof TC.feature.Polyline:
                result.length = feature.getLength(measureOptions);
                const profile = getElevationProfileFromCache(feature);
                if (profile) {
                    self.renderElevationChart(profile.data);
                }
                else {
                    self.displayElevationProfile(feature.geometry);
                }
                break;
            case TC.feature.Point && feature instanceof TC.feature.Point:
                result.coords = feature.geometry;
                break;
            default:
                break;
        }
        return result;
    };

    ctlProto.showMeasures = function (options) {
        const self = this;
        TC.control.Measure.prototype.showMeasures.call(self, options);
        options = options || {};
        var units = options.units;
        const locale = self.map.options.locale || TC.Cfg.locale
        if (options.coords) {
            var precision;
            var coord1, coord2;
            if (options.units === 'm') {
                precision = TC.Consts.METER_PRECISION;
                coord1 = options.coords[0];
                coord2 = options.coords[1];
                self._1stCoordText.innerHTML = 'x: ';
                self._2ndCoordText.innerHTML = 'y: ';
            }
            else {
                precision = TC.Consts.DEGREE_PRECISION;
                coord1 = options.coords[1];
                coord2 = options.coords[0];
                self._1stCoordText.innerHTML = 'lat: ';
                self._2ndCoordText.innerHTML = 'lon: ';
            }
            const factor = Math.pow(10, precision);
            const round = function (val) {
                return Math.round(val * factor) / factor;
            }
            self._1stCoordValue.innerHTML = TC.Util.formatNumber(coord1.toFixed(precision), locale);
            self._1stCoordValue.dataset.value = round(coord1);
            self._2ndCoordValue.innerHTML = TC.Util.formatNumber(coord2.toFixed(precision), locale);
            self._2ndCoordValue.dataset.value = round(coord2);
            if (options.coords.length > 2) {
                const elevation = Math.round(options.coords[2]);
                self._elevationText.innerHTML = self.getLocaleString('ele').toLowerCase() + ': ';
                self._elevationValue.innerHTML = TC.Util.formatNumber(elevation.toFixed(TC.Consts.METER_PRECISION), locale) + ' m';
                self._elevationValue.dataset.value = elevation;
            }
            else {
                self._elevationText.innerHTML = '';
                self._elevationValue.innerHTML = '';
                self._elevationValue.dataset.value = '';
            }
        }
        return self;
    };

    ctlProto.resetValues = function () {
        const self = this;
        TC.control.Measure.prototype.resetValues.call(self);

        if (self._1stCoordText) {
            self._1stCoordText.innerHTML = self.NOMEASURE;
            self._2ndCoordText.innerHTML = '';
            self._1stCoordValue.innerHTML = '';
            self._1stCoordValue.dataset.value = '';
            self._2ndCoordValue.innerHTML = '';
            self._2ndCoordValue.dataset.value = '';
            self._elevationText.innerHTML = '';
            self._elevationValue.innerHTML = '';
            self._elevationValue.dataset.value = '';
        }
        return self;
    };

    ctlProto.resetDrawWatches = function () {
        const self = this;
        self.drawControls.forEach(function (ctl) {
            ctl
                .setStrokeColorWatch()
                .setStrokeWidthWatch();
        });
    };

    ctlProto.clear = function () {
        const self = this;
        self.resetValues();
        self.layer.clearFeatures();
        if (self.modify.isActive) {
            self.modify.deactivate();
        }
        if (self.options.displayElevation) {
            self.resetElevationProfile();
            if (self.resultsPanelChart) {
                self.resultsPanelChart.close();
            }
        }
        self._clearBtn.disabled = true;
        self._downloadBtn.disabled = true;
        return self;
    };

    ctlProto.showSketchDownloadDialog = function (options) {
        const self = this;

        new Promise(function (resolve, reject) {
            if (!downloadDialog) {
                self.map.addControl('FeatureDownloadDialog').then(ctl => {
                    downloadDialog = ctl;
                    resolve(downloadDialog);
                });
            }
            else {
                resolve(downloadDialog);
            }
        }).then(function (control) {
            var options = {
                title: self.getLocaleString("downloadSketch"),
                fileName: self.getLocaleString('sketch').toLowerCase().replace(' ', '_') + '_' + TC.Util.getFormattedDate(new Date().toString(), true)
            };

            //const dialog = self._dialogDiv.querySelector('.' + self.CLASS + '-dialog');
            const hasPoints = self.layer.features.some(function (feature) {
                return (TC.feature.Point && feature instanceof TC.feature.Point) ||
                    (TC.feature.MultiPoint && feature instanceof TC.feature.MultiPoint);
            });
            const hasLines = self.layer.features.some(function (feature) {
                return (TC.feature.Polyline && feature instanceof TC.feature.Polyline) ||
                    (TC.feature.MultiPolyline && feature instanceof TC.feature.MultiPolyline);
            });
            const hasPolygons = self.layer.features.some(function (feature) {
                return (TC.feature.Polygon && feature instanceof TC.feature.Polygon) ||
                    (TC.feature.MultiPolygon && feature instanceof TC.feature.MultiPolygon);
            });
            //si solo hay poligonos ocultamos el botón de formato GPX
            if (!hasPoints && !hasLines && hasPolygons)
                options = Object.assign({}, options, { excludedFormats: ["GPX"] })

            //si el control tiene su propia configurtación de elevacion la pasamos para que sobrescriba  a la del mapa
            if (self.options.displayElevation !== true)
                options = Object.assign({}, options, { elevation: Object.assign({}, self.map.elevation && self.map.elevation.options, self.options.displayElevation) });
            else
                options = Object.assign({}, options, { elevation: self.map.elevation && self.map.elevation.options });

            control.open(self.layer.features, options);
            
        });
        return self;
        
    };

    ctlProto.onStyleChange = function (e) {
        const self = this;
        var featureCtor;
        switch (e.target.mode) {
            case TC.Consts.geom.POLYGON:
                featureCtor = TC.feature.Polygon;
                break;
            case TC.Consts.geom.POLYLINE:
                featureCtor = TC.feature.Polyline;
                break;
            case TC.Consts.geom.POINT:
                featureCtor = TC.feature.Point;
                break;
            default:
                break;
        }
        if (featureCtor) {
            self.modify.getSelectedFeatures().forEach(function (feature) {
                if (feature instanceof featureCtor) {
                    const styleOptions = {};
                    styleOptions[e.property] = e.value;
                    //feature._originalStyle[e.property] = e.value;
                    feature.setStyle(styleOptions);
                    //clearTimeout(feature._selectionStyleTimeout);
                    //feature._selectionStyleTimeout = setTimeout(function () {
                    //    feature.setStyle(self.modify.styleFunction(feature));
                    //}, self.options.styleChangeDisplayTimeout || 1000);
                }
            });
        }
    }

    ctlProto.displayElevationProfile = function (coords) {
        const self = this;
        if (coords.length === 1) {
            // Espera una línea, metemos un segundo punto
            coords = coords.slice();
            coords.push(coords[0]);
        }
        const li = self.map.getLoadingIndicator();
        const waitId = li && li.addWait();
        self.elevation.getElevation({
            crs: self.map.crs,
            coordinates: coords,
            partialCallback: function (elevCoords) {
                li && li.removeWait(waitId);
                var distance = 0.0;
                var maxElevation = Number.NEGATIVE_INFINITY;
                var minElevation = Number.POSITIVE_INFINITY;
                const profile = elevCoords
                    .map(function (point, idx, arr) {
                        const prev = idx === 0 ? point : arr[idx - 1];
                        const dx = point[0] - prev[0];
                        const dy = point[1] - prev[1];
                        distance += Math.sqrt(dx * dx + dy * dy);
                        var ele = point[2];
                        if (typeof ele === 'number') {
                            maxElevation = Math.max(ele, maxElevation);
                            minElevation = Math.min(ele, minElevation);
                        }
                        return [distance, ele];
                    });

                self.elevationChartData = {
                    x: profile.map(function (elm) {
                        return elm[0];
                    }),
                    ele: profile.map(function (elm) {
                        return elm[1];
                    }),
                    coords: elevCoords
                };
                const elevationGainOptions = {
                    coords: elevCoords
                };
                if (typeof self.options.displayElevation === 'object') {
                    elevationGainOptions.hillDeltaThreshold = self.options.displayElevation.hillDeltaThreshold;
                }
                TC.Util.extend(self.elevationChartData, TC.tool.Elevation.getElevationGain(elevationGainOptions));

                // Cacheamos el perfil
                const matchingFeature = self.layer.features
                    .filter(function (feat) {
                        return TC.feature.Polyline && feat instanceof TC.feature.Polyline;
                    })
                    .filter(function (line) {
                        for (var i = 0, len = line.geometry.length; i < len; i++) {
                            const coord = coords[i];
                            const lineCoord = line.geometry[i];
                            if (!coord || coord[0] !== lineCoord[0] || coord[1] !== lineCoord[1]) {
                                return false;
                            }
                        }
                        return true;
                    })[0];
                if (matchingFeature) {
                    cacheElevationProfile(matchingFeature, self.elevationChartData);
                }

                if (self.resultsPanelChart) {
                    self.renderElevationChart();
                }
                else {
                    self.createChartPanel().then(function (resultsPanelChart) {
                        self.resultsPanelChart.renderPromise().then(function () {
                            self.renderElevationChart();
                        });
                    });
                }
            }
        }).catch(function (error) {
            self.resetElevationProfile();
            li && li.removeWait(waitId);
        });
    };

    ctlProto.createChartPanel = function () {
        const self = this;

        const resultsPanelOptions = {
            id: self.getUID(),
            content: "chart",
            titles: {
                main: self.getLocaleString("geo.trk.chart.chpe"),
                max: self.getLocaleString("geo.trk.chart.chpe")
            },
            chart: {
                ctx: self,
                onmouseout: ctlProto.removeElevationTooltip,
                tooltip: ctlProto.getElevationTooltip
            }
        };

        return new Promise(function (resolve, reject) {
            var addControlPromise;
            const addResultsPanelChart = function (controlContainer) {
                resultsPanelOptions.position = controlContainer.POSITION.RIGHT;
                addControlPromise = controlContainer.addControl('resultsPanel', resultsPanelOptions);
            };

            if (self.options.displayElevation.displayOn) {
                var controlContainer = self.map.getControlsByClass('TC.control.' + self.options.displayElevation.displayOn[0].toUpperCase() + self.options.displayElevation.displayOn.substring(1))[0];
                if (!controlContainer) {
                    self.map.addControl(self.options.displayElevation.displayOn).then(addResultsPanelChart);
                } else {
                    addResultsPanelChart(controlContainer);
                }
            } else {
                resultsPanelOptions.div = document.createElement('div');
                self.map.div.appendChild(resultsPanelOptions.div);
                addControlPromise = self.map.addControl('resultsPanel', resultsPanelOptions);
            }

            addControlPromise.then(function (resultsPanelChart) {
                resultsPanelChart.caller = self;
                self.resultsPanelChart = resultsPanelChart;
                self._decorateChartPanel();
                resolve(resultsPanelChart);
            });
        });
    };

    ctlProto._decorateChartPanel = function () {
        const self = this;
        self.resultsPanelChart.setCurrentFeature = function (feature) {
            const that = this;
            if (that.currentFeature) {
                that.currentFeature.toggleSelectedStyle(false);
            }
            that.currentFeature = feature;
            if (feature) {
                feature.toggleSelectedStyle(true);
            }
        };
    };

    ctlProto.renderElevationChart = function (profileData) {
        const self = this;
        self.elevationChartData = profileData || self.elevationChartData;
        if (self.resultsPanelChart && self.elevationProfileActive) {
            self.resultsPanelChart.caller = self;
            self.resultsPanelChart.openChart(self.elevationChartData);
            if (!self.resultsPanelChart.isMinimized()) {
                self.resultsPanelChart.show();
            }
        }
    };

    ctlProto.getElevationTooltip = function (d) {
        const self = this;
        self.resultsPanelChart.wrap.showElevationMarker({
            data: d,
            layer: self.layer,
            coords: self.elevationChartData.coords
        });

        return self.resultsPanelChart.getElevationChartTooltip(d);
    };

    ctlProto.removeElevationTooltip = function () {
        var self = this;
        self.resultsPanelChart.wrap.hideElevationMarker();
    }

    ctlProto.activateElevationProfile = function () {
        const self = this;
        self.elevationProfileActive = true;
        self._elevProfileBtn.classList.add(TC.Consts.classes.ACTIVE);
        self._elevProfileBtn.setAttribute('title', self.getLocaleString('deactivateElevationProfile'));
        var profileDrawn = false;
        if (self.lineDrawControl.historyIndex > 1) {
            self.displayElevationProfile(self.lineDrawControl.history.slice(0, self.lineDrawControl.historyIndex));
            profileDrawn = true;
        }
        else {
            const features = self.modify.getActiveFeatures().filter(function (feat) {
                return TC.feature.Polyline && feat instanceof TC.feature.Polyline;
            });
            if (features.length) {
                const feature = features[features.length - 1];
                self.displayElevationProfile(feature.geometry);
                profileDrawn = true;
            }
        }
        if (!profileDrawn) {
            self.resetElevationProfile();
        }
        if (self.resultsPanelChart) {
            self.resultsPanelChart.show();
        }
    };

    ctlProto.deactivateElevationProfile = function () {
        const self = this;
        self.elevationProfileActive = false;
        self._elevProfileBtn.classList.remove(TC.Consts.classes.ACTIVE);
        self._elevProfileBtn.setAttribute('title', self.getLocaleString('activateElevationProfile'));
        self.resetElevationProfile();
        if (self.resultsPanelChart) {
            self.resultsPanelChart.close();
        }
    };

    ctlProto.resetElevationProfile = function () {
        const self = this;
        if (self.options.displayElevation && self.resultsPanelChart) {
            self.elevationChartData = {
                x: [0],
                ele: [0],
                coords: [0, 0, 0],
                upHill: 0,
                downHill: 0
            };
            self.resultsPanelChart.openChart(self.elevationChartData);
        }
    };

})();
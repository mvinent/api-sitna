﻿
TC.layer = TC.layer || {};

if (!TC.Layer) {
    TC.syncLoadJS(TC.apiLocation + 'TC/Layer');
}

TC.Consts.BLANK_IMAGE = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAQAIBRAA7';

(function () {

    var capabilitiesPromises = {};

    const isWebWorkerEnabled = window.hasOwnProperty('Worker');
    const wwPromise = new Promise(function (resolve, reject) {
        if (isWebWorkerEnabled) {
            // Para evitar problemas con IE10 y Opera evitamos el uso de blobs cuando es evitable
            var wwLocation = TC.apiLocation + 'TC/workers/tc-caps-web-worker.js';
            if (TC.Util.isSameOrigin(TC.apiLocation)) {
                resolve(wwLocation);
            }
            else {
                TC.ajax({
                    url: wwLocation,
                    method: 'GET',
                    responseType: 'text'
                }).then(
                    function (response) {
                        const data = response.data;
                        var blob = new Blob([data], { type: "text/javascript" });
                        var url = window.URL.createObjectURL(blob);
                        resolve(url);
                    },
                    function (e) {
                        reject(Error(e));
                    }
                    );
            }
        }
    });

    const parseCapabilities = function (layer, data) {
        var capabilities;

        if (data.documentElement) {

            const serviceException = data.getElementsByTagName('ServiceException')[0];
            if (serviceException) {
                capabilities = { error: serviceException.textContent };
            }
            else {
                var format = (layer.type === TC.Consts.layerType.WMTS) ? new layer.wrap.WmtsParser() : new layer.wrap.WmsParser();
                capabilities = format.read(data);

                //parsear a manija los tileMatrixSetLimits, que openLayers no lo hace (de momento)
                if (layer.type === TC.Consts.layerType.WMTS) {
                    if (capabilities.Contents && capabilities.Contents.Layer) {
                        const layerCollection = data.getElementsByTagName('Layer');
                        for (var i = 0, len = layerCollection.length; i < len; i++) {
                            const curXmlLy = layerCollection[i];
                            var nd = TC.Util.getElementByNodeName(curXmlLy, "ows:Identifier")[0];
                            var id = nd.firstChild.data;

                            var capLy = capabilities.Contents.Layer.filter(function (ly) {
                                return ly.Identifier == id;
                            });

                            if (capLy.length) {
                                capLy = capLy[0];
                                for (var j = 0; j < capLy.TileMatrixSetLink.length; j++) {
                                    var capLink = capLy.TileMatrixSetLink[j];
                                    matrixId = capLink.TileMatrixSet;

                                    var xmlLink;
                                    const xmlLinks = curXmlLy.getElementsByTagName('TileMatrixSetLink');
                                    for (var k = 0, kk = xmlLinks.length; k < kk; k++) {
                                        const curLink = xmlLinks[k];
                                        if (curLink.querySelector("TileMatrixSet:first").textContent == matrixId) {
                                            xmlLink = curLink;
                                            break;
                                        }
                                    }

                                    if (xmlLink) {
                                        capLink.TileMatrixSetLimits = [];
                                        const tmlCollection = xmlLink.getElementsByTagName('TileMatrixLimits');
                                        for (var k = 0, kk = tmlCollection.length; k < kk; k++) {
                                            const lim = tmlCollection[k];
                                            capLink.TileMatrixSetLimits.push({
                                                TileMatrix: lim.getElementsByTagName('TileMatrix')[0].textContent,
                                                MinTileRow: parseInt(lim.getElementsByTagName('MinTileRow')[0].textContent),
                                                MinTileCol: parseInt(lim.getElementsByTagName('MinTileCol')[0].textContent),
                                                MaxTileRow: parseInt(lim.getElementsByTagName('MaxTileRow')[0].textContent),
                                                MaxTileCol: parseInt(lim.getElementsByTagName('MaxTileCol')[0].textContent)
                                            });
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            storeCapabilities(layer, capabilities);
            return Promise.resolve(capabilities);
        }
        else {
            return new Promise(function (resolve, reject) {
                if (isWebWorkerEnabled && typeof data === 'string') {
                    wwPromise.then(function (wwUrl) {
                        var worker = new Worker(wwUrl);
                        worker.onmessage = function (e) {
                            if (e.data.state === 'success') {
                                capabilities = e.data.capabilities;

                                // GLS: Sólo almacenamos si el capabilities es correcto
                                storeCapabilities(layer, capabilities);
                            }
                            else {
                                capabilities = {
                                    error: 'Web worker error'
                                }
                                reject(capabilities.error);
                            }

                            resolve(capabilities);
                            worker.terminate();
                        };
                        worker.postMessage({
                            type: layer.type,
                            text: data
                        });
                    })
                }
                else {
                    capabilities = data;
                    resolve(capabilities);
                }
            });
        }
    };

    const capabilitiesError = function (layer, reason) {
        return 'No se pudo obtener el documento de capacidades del servicio ' + layer.url + ': [' + reason + ']';
    };

    const getCapabilitiesOnline = function (layer) {
        return new Promise(function (resolve, reject) {
            const url = layer.getGetCapabilitiesUrl();

            layer.toolProxification.fetch(url, { retryAttempts: 2 }).then(function (data) {
                parseCapabilities(layer, data.responseText)
                    .then(function (capabilities) {
                        if (capabilities.error) {
                            reject(Error(capabilitiesError(layer, capabilities.error)));
                            return;
                        }
                        resolve(capabilities);
                    })
                    .catch(function (error) {
                        reject(Error(error));
                    });
            }).catch(function (dataError) {
                reject(Error(capabilitiesError(layer, dataError)));
            });

        });
    };

    const getCapabilitiesFromStorage = function (layer) {
        return new Promise(function (resolve, reject) {
            // Obtenemos el capabilities almacenado en caché
            TC.loadJS(!window.localforage, [TC.Consts.url.LOCALFORAGE], function () {
                localforage.getItem(layer.CAPABILITIES_STORE_KEY_PREFIX + layer.url)
                    .then(function (value) {
                        if (value) {
                            resolve(value);
                        }
                        else {
                            reject(Error('Capabilities not in storage: ' + layer.url));
                        }
                    })
                    .catch(function () {
                        reject(Error('Undefined storage error'));
                    });
            });
        });
    };

    const storeCapabilities = function (layer, capabilities) {
        TC.loadJS(!window.localforage, [TC.Consts.url.LOCALFORAGE], function () {

            // Esperamos a que el mapa se cargue y entonces guardamos el capabilities.
            // Así evitamos que la operación, que es bastante pesada, ocupe tiempo de carga 
            // (con el efecto secundario de que LoadingIndicator esté un tiempo largo apagado durante la carga)
            var capKey = layer.CAPABILITIES_STORE_KEY_PREFIX + layer.options.url;
            var setItem = function () {
                // GLS: antes de guardar, validamos que es un capabilities sin error
                if (capabilities.hasOwnProperty("error")) {
                    return;
                } else {

                    layer.getCapabilitiesPromise().then(function () {
                        localforage.setItem(capKey, capabilities).then(function () { }).catch(function (err) {
                            console.log(err);
                        });
                    });
                }
            };
            if (layer.map) {
                layer.map.loaded(setItem);
            }
            else {
                setItem();
            }
        });
    };

    const _createWMSLayer = function (layer) {

        var layerNames = Array.isArray(layer.names) ? layer.names.join(',') : layer.names;
        var format = layer.options.format;
        var options = layer.options;

        var params = {
            LAYERS: layerNames,
            FORMAT: format,
            TRANSPARENT: layer.transparent,
            VERSION: layer.capabilities.version || '1.3.0'
        };

        if (layer.params) {
            TC.Util.extend(params, layer.params);
        }

        if (layer.queryParams) {
            TC.Util.extend(params, layer.queryParams);
        }

        var infoFormat = layer.getPreferredInfoFormat();
        if (infoFormat !== null) {
            params.INFO_FORMAT = infoFormat;
        }

        return layer.wrap.createWMSLayer(layer.getGetMapUrl(), params, options);
    };

    const _createWMTSLayer = function (layer) {
        return layer.wrap.createWMTSLayer(layer.options);
    };

    const _getLayerNodeIndex = function _getLayerNodeIndex(layer, treeNode) {

        var result = layer.availableNames.indexOf(treeNode.name);
        if (result === -1) {
            for (var i = 0, len = treeNode.children.length; i < len; i++) {
                result = _getLayerNodeIndex(layer, treeNode.children[i]);
                if (result !== -1) {
                    break;
                }
            }
        }
        return result;
    }

    const _sortTree = function _sortTree(layer, treeNode) {
        var _sortFunction = function (n1, n2) {
            return _getLayerNodeIndex(layer, n2) - _getLayerNodeIndex(layer, n1);
        }
        treeNode.children.sort(_sortFunction);
        for (var i = 0, len = treeNode.children.length; i < len; i++) {
            _sortTree(layer, treeNode.children[i]);
        }
    };

    const _getLayerNamePosition = function _getLayerNamePosition(treeNode, name, counter) {
        var result = false;
        counter.count = counter.count + 1;
        if (treeNode.name === name) {
            result = true;
        }
        else {
            // Las capas se ordenan de arriba a abajo en el árbol, por tanto hay que recorrer la lista del revés
            for (var i = treeNode.children.length - 1; i >= 0; i--) {
                if (_getLayerNamePosition(treeNode.children[i], name, counter)) {
                    result = true;
                    break;
                }
            }
        }
        return result;
    };

    /**
     * Opciones de nombre de capa.
     * Esta clase no tiene constructor.
     * @class TC.cfg.LayerNameOptions
     * @static
     */
    /**
     * Siempre que sea posible se reemplaza en la lista TC.layer.Raster.{{#crossLink "TC.layer.Raster/names:property"}}{{/crossLink}} los nombres de capa por los nombres de las capas de grupo que las contienen.
     * @property aggregate
     * @type boolean
     * @default true
     */
    /**
     * Determina si la capa nativa se actualiza en cuanto cambia la lista TC.layer.Raster.{{#crossLink "TC.layer.Raster/names:property"}}{{/crossLink}} (valor <code>false</code>) 
     * o se espera a que la capa se actualice (valor <code>true</code>).
     * @property lazy
     * @type boolean
     * @default false
     */
    /**
     * Determina si la capa la propiedad TC.layer.Raster.{{#crossLink "TC.layer.Raster/availableNames:property"}}{{/crossLink}} (valor <code>false</code>) se restablece 
     * al actualizar la propiedad TC.layer.Raster.{{#crossLink "TC.layer.Raster/names:property"}}{{/crossLink}}.
     * @property reset
     * @type boolean|undefined
     */

    /**
     * Opciones de capa raster.
     * Esta clase no tiene constructor.
     * @class TC.cfg.RasterOptions
     * @extend TC.cfg.LayerOptions
     * @static
     */
    /**
     * Tipo de capa.
     * @property type
     * @type TC.consts.LayerType
     * @default TC.Consts.layerType.WMS
     */
    /**
     * URL del servicio OGC que define la capa.
     * @property url
     * @type string
     */
    /**
     * Indica si la capa tiene transparencia.
     * @property transparent
     * @type boolean|undefined
     */
    /**
     * Lista separada por comas de los nombres de capa del servicio OGC.
     * @property layerNames
     * @type string|undefined
     */
    /**
     * Nombre de grupo de matrices del servicio WMTS. Propiedad obligatoria para capas de tipo WMTS.
     * @property matrixSet
     * @type string|undefined
     */

    /**
     * Capa de tipo raster, como la de un WMS o un WMTS.
     * @class TC.layer.Raster
     * @extends TC.Layer
     * @constructor
     * @async
     * @param {TC.cfg.LayerOptions} [options] Objeto de opciones de configuración de la capa.
     */
    TC.layer.Raster = function () {
        var self = this;

        if (!TC.tool || !TC.tool.Proxification) {
            TC.syncLoadJS(TC.apiLocation + 'TC/tool/Proxification');
        }

        this.toolProxification = new TC.tool.Proxification(TC.proxify);

        //esta promise se resolverá cuando el capabilities esté descargado y parseado
        //se utiliza para saber cuándo está listo el capabilities en los casos en los que se instancia el layer pero no se añade al mapa
        //porque la forma habitual de detectar esto es por los eventos del mapa (que en esos casos no saltarán)
        this._capabilitiesPromise = null;

        TC.Layer.apply(self, arguments);

        self.wrap = new TC.wrap.layer.Raster(self);

        /**
         * Indica si la capa tiene transparencia.
         * @property transparent
         * @type boolean
         * @default true
         */
        self.transparent = (self.options.transparent === false) ? false : true;

        /**
         * URL del servicio al que pertenenece la capa.
         * @property url
         * @type string
         */
        self.url = self.options.url;
        self.capabilities = TC.capabilities[self.url];

        self.params = self.options.params;
        /**
         * Lista de nombres de capa.
         * @property names
         * @type array
         * @default []
         */
        /**
         * Lista de nombres de capa disponibles inicialmente.
         * @property availableNames
         * @type array
         * @default []
         */
        if (typeof self.options.layerNames === 'string') {
            self.names = self.availableNames = self.options.layerNames.split(',');
        }
        else {
            self.names = [];
            self.availableNames = [];
            if (Array.isArray(self.options.layerNames)) {
                for (var i = 0; i < self.options.layerNames.length; i++) {
                    var name = self.options.layerNames[i];
                    if (typeof name === 'string') {
                        self.names.push(name);
                        self.availableNames.push(name);

                    }
                    else if (name.hasOwnProperty('name')) {
                        self.availableNames.push(name.name);
                        if (name.isVisible === undefined || name.isVisible) {
                            self.names.push(name.name);
                        }
                    }
                }
            } else {
                // Si no se encuentran nombres de capas, se buscan en el parámetro sld_body. Este parámetro es utilizado
                // cuando queremos instanciar una capa pasándole un SLD en la petición
                var sldBody = self.options.params ? self.options.params.sld_body : null;

                if (sldBody) {
                    const parser = new DOMParser();
                    var sldBodyToXml;
                    try {
                        sldBodyToXml = parser.parseFromString(sldBody, 'text/xml');
                    }
                    catch (e) {
                        TC.error(e.message);
                        sldBodyToXml = null;
                    }
                    if (sldBodyToXml) {
                        var namedLayerElm = TC.Util.getElementByNodeName(sldBodyToXml, 'sld:NamedLayer');
                        if (namedLayerElm && namedLayerElm.length > 0) {
                            var names = TC.Util.getElementByNodeName(namedLayerElm[0], 'sld:Name');

                            if (names && names.length > 0) {
                                var name = names[0].textContent;
                                self.names.push(name);
                                self.availableNames.push(name);
                            }
                        }
                    }
                }
            }
        }

        self.ignorePrefixes = self.options.ignorePrefixes === undefined ? true : self.options.ignorePrefixes;

        self._capabilitiesNodes = {};

        /**
      * Árbol del documento de capabilities del servicio.
      * @property capabilities
      * @type object
      */
        self.wrap._promise = new Promise(function (resolve, reject) {
            /*
             *  _createOLLayer: Crea la capa nativa correspondiente según el tipo
             */
            var _createOLLayer = function () {
                var ollyr;
                if (!self.wrap.layer) {
                    switch (self.type) {
                        case TC.Consts.layerType.GROUP:
                            break;
                        case TC.Consts.layerType.WMTS:
                            ollyr = _createWMTSLayer(self);
                            break;
                        default:
                            ollyr = _createWMSLayer(self);
                            break;
                    }
                    self.wrap.setLayer(ollyr);
                    if (ollyr) {
                        resolve(ollyr);
                    }
                    else {
                        reject(Error('Could not create native layer for "' + self.id + '"'));
                    }
                }
            };

            const processedCapabilities = function (capabilities) {
                // Si existe el capabilities no machacamos, porque provoca efectos indeseados en la gestión de capas.
                // En concreto, se regeneran los UIDs de capas, como consecuencia los controles de la API interpretan como distintas capas que son la misma.
                self.capabilities = self.capabilities || capabilities;

                var actualUrl = self.getGetMapUrl();
                TC.capabilities[self.options.url] = TC.capabilities[self.options.url] || capabilities;
                TC.capabilities[actualUrl] = TC.capabilities[actualUrl] || capabilities;

                _createOLLayer();
            };

            if (self.capabilities) {
                processedCapabilities(self.capabilities);
                self._capabilitiesPromise = Promise.resolve(self.capabilities);
                return;
            }

            const cachePromise = capabilitiesPromises[self.url];
            capabilitiesPromises[self.url] = self._capabilitiesPromise = cachePromise || new Promise(function (res, rej) {
                const onlinePromise = getCapabilitiesOnline(self);
                const storagePromise = getCapabilitiesFromStorage(self);

                onlinePromise
                    .then(function (capabilities) {
                        res(capabilities);
                    })
                    .catch(function (error) {
                        storagePromise.catch(function () {
                            rej(error);
                        });
                    });
                storagePromise
                    .then(function (capabilities) {
                        res(capabilities);
                    })
                    .catch(function () {
                        onlinePromise.catch(function (error) {
                            rej(error);
                        });
                    });
            });

            self.getCapabilitiesPromise()
                .then(function (capabilities) {
                    processedCapabilities(capabilities);
                })
                .catch(function (error) {
                    if (self.map) {
                        self.map.trigger(TC.Consts.event.LAYERERROR, { layer: self, reason: 'couldNotGetCapabilities' });
                    }
                    reject(error);
                });
        });

        self._disgregatedLayerNames = null;

        if (TC.Consts.layerType.WMTS == self.type) {
            self.wrap.setWMTSUrl();
        }
    };

    TC.inherit(TC.layer.Raster, TC.Layer);

    var layerProto = TC.layer.Raster.prototype;

    layerProto.PROTOCOL_REGEX = /^(f|ht)tp?:\/\//i;
    layerProto.capabilitiesState_ = {
        PENDING: 0,
        DONE: 1
    };

    layerProto.CAPABILITIES_STORE_KEY_PREFIX = 'TC.capabilities.';

    layerProto.getByProxy_ = function (url) {
        return TC.proxify(url);
    };

    layerProto.getBySSL_ = function (url) {
        var self = this;

        return url.replace(self.PROTOCOL_REGEX, "https://");
    };

    layerProto.getByUrl_ = function (url) {
        return url;
    };


    layerProto.setVisibility = function (visible) {
        var layer = this;
        layer.tree = null;
        layer._cache.visibilityStates = {
        };
        TC.Layer.prototype.setVisibility.call(layer, visible);
    };

    /*
     *  _getLimitedMatrixSet: devuelve un array de tileMatrixSets limitados por su correspondiente TileMatrixSetLimits (si es que lo tiene)
     */
    var _getLimitedMatrixSet = function (layer) {
        var layerId = layer.layerNames;
        var matrixId = layer.matrixSet;
        var cap = layer.capabilities;

        var ret = [];

        var tset = cap.Contents.TileMatrixSet.filter(function (elto) {
            return elto.Identifier == matrixId;
        });
        if (tset.length) {
            tset = tset[0];
            var ly = cap.Contents.Layer.filter(function (elto) { return elto.Identifier == layerId; })[0];
            if (ly.TileMatrixSetLink && ly.TileMatrixSetLink.length && ly.TileMatrixSetLink[0].TileMatrixSetLimits) {
                var limit, limits = ly.TileMatrixSetLink[0].TileMatrixSetLimits;
                for (var i = 0; i < limits.length; i++) {
                    limit = limits[i];
                    var matrix = tset.TileMatrix.filter(function (elto) {
                        return elto.Identifier == limit.TileMatrix
                    });
                    if (matrix.length) {
                        var combi = TC.Util.extend({ matrixIndex: tset.TileMatrix.indexOf(matrix[0]) }, matrix[0], limit);
                        ret.push(combi);
                    }
                }

                return ret;
            }
            else {
                return tset.TileMatrix;
            }
        }
        else
            return null;
    };


    /*
     *  _aggregateLayerNames: devuelve un array de nombres de capa WMS sustituyendo en la medida de lo posible capas por las capas de grupo que las contienen
     */
    var _aggregateLayerNames = function (layer, layerNames) {
        if (layer.type !== TC.Consts.layerType.WMS) {
            return layerNames;
        }
        else {
            var ln = layerNames.slice();
            _aggregateLayerNodeNames(layer, ln, layer.wrap.getRootLayerNode());
            return ln;
        }
    };

    /*
     *  _aggregateLayerNodeNames: Agrega el array de nombres de capa WMS sustituyendo en la medida de lo posible capas por las capas de grupo que las contienen.
     * Se parte de un nodo del árbol de capas del capabilities
     */
    var _aggregateLayerNodeNames = function _aggregateLayerNodeNames(layer, names, layerNode) {
        var result = false;
        var children = layer.wrap.getLayerNodes(layerNode);
        if (children.length) {
            for (var i = 0, len = children.length; i < len; i++) {
                if (_aggregateLayerNodeNames(layer, names, children[i])) {
                    result = true;
                }
            }

            var nodeNames = children.map(function (elm) {
                return layer.wrap.getName(elm);
            }).reverse();
            var idx, firstIdx;
            var fail = false;

            firstIdx = idx = names.indexOf(nodeNames[0]);
            if (idx < 0) {
                fail = true;
            }
            else {
                for (var i = 1, len = nodeNames.length; i < len; i++) {
                    if (nodeNames[i] != names[++idx]) {
                        fail = true;
                        break;
                    }
                }
            }
            if (!fail) {
                var nodeName = layer.wrap.getName(layerNode);
                if (nodeName && nodeNames.length > 1) {
                    names.splice(firstIdx, nodeNames.length, nodeName);
                    result = true;
                }
            }
        }
        return result;
    };

    /*
     *  _disgregateLayerNames: devuelve un array de nombres de capa WMS con solo capas hoja.
     * Parámetros: objeto de capa, array of strings, nodo de la capa en el capabilities, booleano que dice si esta rama viene de un nodo visible
     */
    var _disgregateLayerNames = function (layer, layerNames) {
        var result = [];
        var ln = layerNames.slice();
        var rootNode = layer.wrap.getRootLayerNode();
        for (var i = 0, len = ln.length; i < len; i++) {
            result = result.concat(_disgregateLayerName(layer, ln[i], rootNode));
        }
        return result;
    };

    var _disgregateLayerName = function _disgregateLayerName(layer, name, layerNode, ancestorVisible) {
        var result = [];
        var nodeName = layer.wrap.getName(layerNode);
        var nodeVisible = layer.compareNames(name, nodeName);
        var hasEmptyChildren = false;
        var children = layer.wrap.getLayerNodes(layerNode);
        for (var i = 0; i < children.length; i++) {
            var names = _disgregateLayerName(layer, name, children[i], ancestorVisible || nodeVisible);
            if (!names.length) {
                hasEmptyChildren = true;
            }
            else {
                result = result.concat(names);
            }
        }
        if (!children.length || hasEmptyChildren) {
            if (ancestorVisible || nodeVisible) {
                result = [nodeName];
            }
        }
        return result;
    };

    var _extendLayerNameOptions = function (options) {
        return TC.Util.extend({ aggregate: true, lazy: false }, options);
    };

    var _combineArray = function (source, add, rem) {
        var result = [];
        var s, a, r;
        s = source ? source : [];
        a = add ? add : [];
        r = rem ? rem : [];
        var sa = s.concat(a);
        for (var i = 0; i < sa.length; i++) {
            if (sa.indexOf(sa[i]) === i && r.indexOf(sa[i]) === -1) {
                result[result.length] = sa[i];
            }
        }
        return result;
    };

    var _sortLayerNames = function (layer, layerNames) {
        var ln = (typeof layerNames === 'string') ? layerNames.split(',') : layerNames;
        if (layer.capabilities) {
            var tree = layer.getTree();
            ln.sort(function (a, b) {
                var idxa = {
                    count: 0
                };
                var idxb = {
                    count: 0
                };
                _getLayerNamePosition(tree, a, idxa);
                _getLayerNamePosition(tree, b, idxb);
                return idxa.count - idxb.count;
            });
        }
        return ln;
    };

    var _isNameInArray = function (layer, name, names, looseComparison) {
        return names.filter(function (elm) {
            return layer.compareNames(name, elm, looseComparison);
        }).length > 0;
    };


    layerProto.getLimitedMatrixSet = function () {
        return _getLimitedMatrixSet(this);
    };

    /**
     * Establece los nombres de capas que deben estar visibles en un WMS. Si la lista está vacía, hace invisible la capa.
     * @method setLayerNames
     * @param {array|string} layerNames Array de strings con los nombres de capa o string con los nombres de capa separados por comas.
     * @param {TC.cfg.LayerNameOptions} [options]
     */
    /*
     *  setLayerNames: sets the visible layer names of a WMS layer
     *  Parameters: array of string, options object: { aggregate: boolean (default true), lazy: boolean (default false), reset: boolean (default false) }
     *  aggregate option replaces layer name sets by layer group names when possible
     *  lazy option does not update OpenLayers layer
     */
    layerProto.setLayerNames = function (layerNames, options) {
        var layer = this;
        return new Promise(function (resolve, reject) {
            layer.wrap.getLayer().then(function () {
                var ln = Array.isArray(layerNames) ? layerNames : layerNames.split(',');
                layer.names = ln;
                var opts = _extendLayerNameOptions(options);
                if (opts.aggregate) {
                    ln = _aggregateLayerNames(layer, ln);
                }
                layer._disgregatedLayerNames = null;
                var newParams = {
                    LAYERS: ln.join(','), TRANSPARENT: true
                };
                if (opts.lazy) {
                    var params = layer._newParams || layer.wrap.getParams();
                    layer._newParams = TC.Util.extend(params, newParams);
                }
                else {
                    if (layer.map) {
                        layer.map.trigger(TC.Consts.event.BEFOREUPDATEPARAMS, { layer: layer });
                    }
                    layer.tree = null;
                    layer._cache.visibilityStates = {
                    };
                    layer.wrap.setParams(newParams);
                    if (opts.reset || !layer.map) {
                        // layerNames se fija cuando se añade al mapa o cuando reset = true.
                        layer.availableNames = layer.names;
                    }
                    if (layer.map) {
                        layer.map.trigger(TC.Consts.event.UPDATEPARAMS, { layer: layer });
                    }
                }
                resolve(layer.names);
            });
        });
    };

    /**
     * Añade capas por nombre a las que ya están visibles en el WMS
     * @method addLayerNames
     * @param {array|string} layerNames Array de strings con los nombres de capa o string con los nombres de capa separados por comas.
     * @param {TC.cfg.LayerNameOptions} [options]
     */
    /*
     *  addLayerNames: adds layer names to the set of visible layer names of a WMS layer
     *  Parameters: array of string, options object: { aggregate: boolean (default true), lazy: boolean (default false), reset: boolean (default false) }
     *  aggregate option replaces layer name sets by layer group names when possible
     *  lazy option does not update OpenLayers layer
     */
    layerProto.addLayerNames = function (layerNames, options) {
        const self = this;
        return new Promise(function (resolve, reject) {
            self.wrap.getLayer().then(function () {
                var opts = _extendLayerNameOptions(options);
                var ln2a = Array.isArray(layerNames) ? layerNames : layerNames.split(',');
                var ln = self.wrap.getParams().LAYERS;
                if (opts.aggregate) {
                    ln2a = _disgregateLayerNames(self, ln2a);
                    ln = self.getDisgregatedLayerNames();
                }
                self.setLayerNames(_sortLayerNames(self, _combineArray(ln, ln2a, null)), options).then(function (names) {
                    resolve(names);
                });
            });
        });
    };

    /**
     * Elimina capas por nombre de las que están visibles en el WMS
     * @method addLayerNames
     * @param {array|string} layerNames Array de strings con los nombres de capa o string con los nombres de capa separados por comas.
     * @param {TC.cfg.LayerNameOptions} [options]
     */
    /*
     *  removeLayerNames: removes layer names from the set of visible layer names of a WMS layer
     *  Parameters: array of string, options object: { aggregate: boolean (default true), lazy: boolean (default false), reset: boolean (default false) }
     *  aggregate option replaces layer name sets by layer group names when possible
     *  lazy option does not update OpenLayers layer
     */
    layerProto.removeLayerNames = function (layerNames, options) {
        const self = this;
        return new Promise(function (resolve, reject) {
            self.wrap.getLayer().then(function () {
                var opts = _extendLayerNameOptions(options);
                var ln2r = Array.isArray(layerNames) ? layerNames : layerNames.split(',');
                var ln = self.wrap.getParams().LAYERS;
                if (opts.aggregate) {
                    ln2r = _disgregateLayerNames(self, ln2r);
                    ln = self.getDisgregatedLayerNames();
                }
                self.setLayerNames(_sortLayerNames(self, _combineArray(ln, null, ln2r)), options).then(function (names) {
                    resolve(names);
                });
            });
        });
    };

    /**
     * Toma una lista de nombres de capa WMS y cambia su visibilidad: de visible a no visible y viceversa.
     * @method toggleLayerNames
     * @param {array|string} layerNames Array de strings con los nombres de capa o string con los nombres de capa separados por comas.
     * @param {TC.cfg.LayerNameOptions} [options]
     */
    /*
     *  toggleLayerNames: from a list, adds a layer name when it is not visible or removes a layer name when it is visible in a WMS layer
     *  Parameters: array of string, options object: { aggregate: boolean (default true), lazy: boolean (default false), reset: boolean (default false) }
     *  aggregate option replaces layer name sets by layer group names when possible
     *  lazy option does not update OpenLayers layer
     */
    layerProto.toggleLayerNames = function (layerNames, options) {
        const self = this;
        return new Promise(function (resolve, reject) {
            self.wrap.getLayer().then(function () {
                var opts = _extendLayerNameOptions(options);
                var ln2t = Array.isArray(layerNames) ? layerNames : layerNames.split(',');
                var currentLayerNames = self.wrap.getParams().LAYERS;
                if (opts.aggregate) {
                    ln2t = _disgregateLayerNames(self, ln2t);
                    currentLayerNames = self.getDisgregatedLayerNames();
                }
                var ln2a = [];
                var ln2r = [];
                for (var i = 0; i < ln2t.length; i++) {
                    var l = ln2t[i];
                    if (currentLayerNames.indexOf(l) < 0) {
                        ln2a[ln2a.length] = l;
                    }
                    else {
                        ln2r[ln2r.length] = l;
                    }
                }
                var promises = [];
                if (ln2a.length > 0) {
                    promises.push(self.addLayerNames(ln2a, opts));
                }
                if (ln2r.length > 0) {
                    promises.push(self.removeLayerNames(ln2r, opts));
                }
                Promise.all(promises).then(function (arrays) {
                    const a1 = arrays[0];
                    const a2 = arrays[1];
                    if (a1) {
                        if (a2) {
                            resolve(a1.concat(a2));
                        }
                        else {
                            resolve(a1);
                        }
                    }
                    else {
                        resolve([]);
                    }
                });
            });
        });
    };

    /**
     * Devuelve la lista de nombres de capa WMS hoja correspondientes a las capas visibles.
     * @method getDisgregatedLayerNames
     * @return {array}
     */
    /*
     *  getDisgregatedLayerNames: returns an array of visible WMS leaf layer names
     */
    layerProto.getDisgregatedLayerNames = function () {
        ///<summary>
        ///Devuelve la lista de nombres de capa WMS hoja correspondientes a las capas visibles.
        ///</summary>
        ///<returns type="array" elementType="string"></returns>
        var self = this;
        var olLayer = self.wrap.layer;
        if (self.wrap.isNative(olLayer) && self.type === TC.Consts.layerType.WMS) {
            if (!self._disgregatedLayerNames) {
                var layerNames = self.wrap.getParams().LAYERS;
                layerNames = Array.isArray(layerNames) ? layerNames : layerNames.split(',');
                self._disgregatedLayerNames = _disgregateLayerNames(self, layerNames);
            }
        }
        else {
            self._disgregatedLayerNames = self.names;
        }
        return self._disgregatedLayerNames.slice();
    };

    layerProto.isValidFromNames = function () {
        var self = this;
        var result = true;
        for (var i = 0, len = self.names.length; i < len; i++) {
            if (!self.getLayerNodeByName(self.names[i])) {
                result = false;
                break;
            }
        }
        return result;
    };

    layerProto.isCompatible = function (crs) {
        var self = this;
        var result = false;
        switch (self.type) {
            case TC.Consts.layerType.WMTS:
                result = self.wrap.isCompatible(crs) || self.wrap.getCompatibleMatrixSets(crs).length > 0;
                break;
            case TC.Consts.layerType.WMS:
                result = self.wrap.isCompatible(crs);
                break;
            default:
                break;
        }
        return result;
    };

    layerProto.getCompatibleCRS = function (options) {
        const self = this;
        options = options || {};
        var result = self.wrap.getCompatibleCRS();
        if (options.includeFallback && self.fallbackLayer) {
            const fbLayer = self.getFallbackLayer();
            if (fbLayer instanceof TC.Layer) {
                result = result.concat(fbLayer.wrap.getCompatibleCRS());
            }
        }
        if (options.normalized) {
            result = result
                .map(function (crs) {
                    return TC.Util.getCRSCode(crs);
                }) // códigos numéricos
                .filter(function (code) {
                    return code !== null;
                })
                .reduce(function (prev, cur) {
                    if (prev.indexOf(cur) < 0) {
                        prev[prev.length] = cur;
                    }
                    return prev;
                }, []) // códigos numéricos sin duplicados
                .map(function (code) {
                    return 'EPSG:' + code;
                }); // códigos normalizados
        }
        return result;
    };

    layerProto.getProjection = function () {
        var self = this;

        switch (self.type) {
            case TC.Consts.layerType.WMTS:
                return self.wrap.layer.getSource().getProjection().getCode();
            case TC.Consts.layerType.WMS:
                return self.map.crs;
        }
    };

    layerProto.setProjection = function (options) {
        var self = this;
        options = options || {};
        if (options.crs) {
            switch (self.type) {
                case TC.Consts.layerType.WMTS:
                    var matrixSet = self.wrap.getCompatibleMatrixSets(options.crs)[0];
                    if (matrixSet) {
                        self.matrixSet = matrixSet;
                        self.wrap.setMatrixSet(matrixSet);
                    }
                    else {
                        self.wrap.setProjection(options);
                    }
                    self.mustReproject = !matrixSet;
                    break;
                case TC.Consts.layerType.WMS:
                    self.wrap.setProjection(options);
                    self.mustReproject = !self.isCompatible(options.crs);
                    break;
                default:
                    break;
            }
        }
    };

    /*
     *  isVisibleByScale: return wether the WMS layer is visible at current scale
     *  Parameter: WMS layer name or UID
     */
    layerProto.isVisibleByScale = function (nameOrUid, looseComparison) {
        var self = this;
        var result;
        var _getOgcScale = function () {
            return self.map.wrap.getResolution() * self.map.getMetersPerUnit() / 0.00028; // OGC assumes 0.28 mm / pixel
        };
        var currentScale;
        var i;
        switch (self.type) {
            case TC.Consts.layerType.WMTS:
                result = false;
                var tileMatrix = self.wrap.getTileMatrix(self.options.matrixSet);
                if (tileMatrix) {
                    currentScale = _getOgcScale();
                    for (i = 0; i < tileMatrix.length; i++) {
                        var scaleDenominators = self.wrap.getScaleDenominators(tileMatrix[i]);
                        if (scaleDenominators[0] === currentScale) {
                            result = true;
                            break;
                        }
                    }
                }
                break;
            case TC.Consts.layerType.WMS:
                result = true;
                var layers = self.wrap.getAllLayerNodes();
                if (layers.length > 0) {
                    currentScale = _getOgcScale();
                    var node;
                    if (parseInt(nameOrUid).toString() === nameOrUid) { // Es numérico, asumimos que es un UID
                        node = self._capabilitiesNodes[nameOrUid];
                    }
                    else {
                        for (i = 0; i < layers.length; i++) {
                            var layer = layers[i];
                            if (self.compareNames(self.wrap.getName(layer), nameOrUid, looseComparison)) {
                                node = layer;
                                break;
                            }
                        }
                    }
                    if (node) {
                        var scaleDenominators = self.wrap.getScaleDenominators(node);
                        result = !(parseFloat(scaleDenominators[1]) > currentScale || parseFloat(scaleDenominators[0]) < currentScale);

                        // GLS: si no es visible miramos si tiene capas hijas y si tiene comprobamos si alguna de ellas es visible a la escala actual.
                        if (!result) {
                            if (node.Layer && node.Layer.length > 0) {
                                return node.Layer.some(function (nodeLayer) {
                                    var scaleDenominators = self.wrap.getScaleDenominators(nodeLayer);
                                    return !(parseFloat(scaleDenominators[1]) > currentScale || parseFloat(scaleDenominators[0]) < currentScale)
                                });
                            }
                        }
                    }
                }
                break;
            default:
                result = true;
                break;
        }
        return result;
    };

    /*
     *  isVisibleByName: return wether the WMS layer is visible because of the requested layer names
     *  Parameter: WMS layer name
     */
    layerProto.isVisibleByName = function (name, looseComparison) {
        var self = this;
        var result = false;
        switch (self.type) {
            case TC.Consts.layerType.WMTS:
                if (self.wrap.getWMTSLayer()) {
                    result = true;
                    break;
                }
                break;
            case TC.Consts.layerType.WMS:
                var _getLayerPath = function _getLayerPath(name) {
                    return __getLayerPath(name, self.wrap.getRootLayerNode());
                };

                var __getLayerPath = function __getLayerPath(name, capabilitiesNode) {
                    var result = null;
                    var n = self.wrap.getName(capabilitiesNode);
                    if (self.compareNames(n, name, looseComparison)) {
                        result = [n];
                    }
                    else {
                        var layerNodes = self.wrap.getLayerNodes(capabilitiesNode);
                        for (var i = 0; i < layerNodes.length; i++) {
                            var item = layerNodes[i];
                            var r = __getLayerPath(name, item);
                            if (r) {
                                TC.Util.fastUnshift(r, n);
                                result = r;
                                break;
                            }
                        }
                    }
                    return result;
                };

                var path = _getLayerPath(name);
                if (path) {
                    for (var i = 0; i < path.length; i++) {
                        if (_isNameInArray(self, path[i], self.names)) {
                            result = true;
                            break;
                        }
                    }
                }
                break;
            default:
                result = true;
                break;
        }
        return result;
    };

    layerProto.getTree = function () {
        var self = this;
        
        var result = self.tree;

        var addChild = function (node, child) {
            if (self.options.inverseTree) {
                // Versión rápida de unshift
                TC.Util.fastUnshift(node.children, child);
            }
            else {
                node.children[node.children.length] = child;
            }
        }

        if (!result) {
            var rootNode;
            var getTreeNode = function getTreeNode(capabilitiesNode, forceAddition, isRootNode) {
                var uid;
                for (var key in self._capabilitiesNodes) {
                    if (self._capabilitiesNodes[key] === capabilitiesNode) {
                        uid = key;
                        break;
                    }
                }
                if (!uid) {
                    uid = TC.getUID();
                    self._capabilitiesNodes[uid] = capabilitiesNode;
                }
                var r = {
                    name: self.wrap.getName(capabilitiesNode), title: capabilitiesNode.title || capabilitiesNode.Title, uid: uid, children: []
                };
                if (isRootNode) {
                    rootNode = r;
                }

                if (_isNameInArray(self, r.name, self.availableNames)) {
                    forceAddition = true;
                }

                if (!self.options.isBase) {
                    if (r === rootNode) {
                        r.isVisible = self.getVisibility();
                    }
                    else {
                        r.isVisible = self.isVisibleByName(r.name);
                    }
                    var i;
                    var layerNodes = self.wrap.getLayerNodes(capabilitiesNode);
                    for (i = 0; i < layerNodes.length; i++) {
                        var treeNode = getTreeNode(layerNodes[i], forceAddition);
                        if (treeNode) {
                            addChild(r, treeNode);
                        }
                    }

                    r.legend = self.wrap.getLegend(capabilitiesNode);

                    // No muestra ramas irrelevantes si hideTree = true
                    if (!forceAddition && !isRootNode) {
                        // Eliminamos la rama hasta el nodo de interés
                        rootNode.children = rootNode.children.concat(r.children);
                        r = null;
                    }
                }
                else {
                    r.name = self.names.join(',');
                    r.title = self.title || r.title;
                    r.isBase = self.isDefault;
                    if (self.options.thumbnail) {
                        r.legend = {
                            src: self.options.thumbnail
                        };
                    }
                }
                return r;
            };

            switch (self.type) {
                case TC.Consts.layerType.WMTS:
                    result = getTreeNode(self.wrap.getWMTSLayer(), !self.options.hideTree, true);
                    break;
                case TC.Consts.layerType.WMS:
                    if (self.capabilities) {
                        result = getTreeNode(self.wrap.getRootLayerNode(), !self.options.hideTree, true);

                        var cache = self._cache.visibilityStates;

                        var _setNodeState = function _setNodeState(node) {
                            var _result = TC.Consts.visibility.NOT_VISIBLE;
                            if (node) {
                                if (cache[node.uid] !== undefined) {
                                    _result = cache[node.uid];
                                }
                                else {
                                    if (node.children) {
                                        var hasVisible = false;
                                        var hasNotVisible = false;
                                        for (var i = 0, len = node.children.length; i < len; i++) {
                                            var r = _setNodeState(node.children[i]);
                                            switch (r) {
                                                case TC.Consts.visibility.VISIBLE:
                                                    hasVisible = true;
                                                    break;
                                                case TC.Consts.visibility.NOT_VISIBLE:
                                                    hasNotVisible = true;
                                                    break;
                                                case TC.Consts.visibility.HAS_VISIBLE:
                                                    hasVisible = true;
                                                    hasNotVisible = true;
                                                    break;
                                                default:
                                                    break;
                                            }
                                            if (hasVisible) {
                                                if (hasNotVisible) {
                                                    _result = TC.Consts.visibility.HAS_VISIBLE;
                                                }
                                                else {
                                                    _result = TC.Consts.visibility.VISIBLE;
                                                }
                                            }
                                        }
                                    }
                                    if (node.isVisible) {
                                        _result = TC.Consts.visibility.VISIBLE;
                                    }
                                    cache[node.uid] = _result;
                                }
                                node.visibilityState = _result;
                            }
                            return _result;
                        };
                        _setNodeState(result);

                        if (self.options.hideTree) {
                            _sortTree(self, result);
                        }
                    }
                    break;
                default:
                    break;
            }
            if (!result) {
                result = {
                    name: self.name, title: self.title
                };
            }
            result.title = self.title || result.title;
            result.customLegend = self.customLegend || result.customLegend;
            self.tree = result;
        }
        return result;
    };

    layerProto.setNodeVisibility = function (id, visible) {
        var self = this;
        if (!self.tree) {
            self.tree = self.getTree();
        }

        var _getNames = function _getNames(node) {
            var result = [];
            if (node.name) {
                result[0] = node.name;
            }
            else {
                for (var i = 0; i < node.children.length; i++) {
                    result = result.concat(_getNames(node.children[i]));
                }
            }
            return result;
        };

        var node = self.findNode(id, self.tree);
        if (node === self.tree) {
            if (visible && self.names.length === 0) {
                // Prevent pink error tile
                self.addLayerNames(self.availableNames).then(function () {
                    self.setVisibility(true);
                });
            }
            else {
                self.setVisibility(visible);
            }
        }
        else {
            var names = _getNames(node);
            if (visible) {
                self.addLayerNames(names);
            }
            else {
                self.removeLayerNames(names);
            }
        }
    };

    layerProto.getNodeVisibility = function (id) {
        var self = this;
        if (!self.tree) {
            self.tree = self.getTree();
        }
        return self._cache.visibilityStates[id];
    };

    layerProto.getNodePath = function (layerName, ignorePrefix) {
        var self = this;
        var result = [];
        if (self.type === TC.Consts.layerType.WMS && self.capabilities) {
            layerName = layerName || self.names[0];

            var _getPath = function _getPath(node) {
                var res = [];
                var nodeName = self.wrap.getName(node);
                if (self.compareNames(nodeName, layerName, ignorePrefix)) {
                    res.push(node);
                }
                else {
                    var children = self.wrap.getLayerNodes(node);
                    for (var i = 0; i < children.length; i++) {
                        var r = _getPath(children[i]);
                        if (r.length) {
                            res = r;
                            TC.Util.fastUnshift(res, node);
                            break;
                        }
                    }
                }
                return res;
            };
            result = _getPath(self.wrap.getRootLayerNode());
        }
        return result;
    };

    layerProto.getPath = function (layerName, ignorePrefix) {
        return this.getNodePath(layerName, ignorePrefix).map(function (node) {
            return node.title || node.Title;
        });
    };

    layerProto.getLayerNodeByName = function (name) {
        var result = null;
        var self = this;
        var getName = self.wrap.getServiceType() === TC.Consts.layerType.WMTS ? self.wrap.getIdentifier : self.wrap.getName
        var nodes = self.wrap.getAllLayerNodes();
        for (var i = 0, len = nodes.length; i < len; i++) {
            if (self.compareNames(getName(nodes[i]), name)) {
                result = nodes[i];
                break;
            }
        }
        return result;
    };

    layerProto.getChildrenLayers = function (layer) {
        var self = this;
        var result = [];
        var _fnRecursiva = function (lyr, arr) {
            if (lyr && lyr.Layer && lyr.Layer.length) {
                for (var i = 0; i < lyr.Layer.length; i++) {
                    arr[arr.length] = lyr.Layer[i];
                    _fnRecursiva(lyr.Layer[i], arr)
                }
            }
        };
        _fnRecursiva(layer, result);
        return result;
    };

    layerProto.compareNames = function (n1, n2, looseComparison) {
        var result = n1 === n2;
        var self = this;
        var lc = looseComparison !== undefined ? looseComparison : self.ignorePrefixes
        if (!result && lc && n1 && n2) {
            // Revisamos si tienen prefijo. Si lo tiene solo una de las dos lo obviamos para la comparación
            var idx1 = n1.indexOf(':');
            var idx2 = n2.indexOf(':');
            if (idx1 >= 0 && idx2 < 0) {
                result = n1.substr(idx1 + 1) === n2;
            }
            else if (idx2 >= 0 && idx1 < 0) {
                result = n1 === n2.substr(idx2 + 1);
            }
        }
        return result;
    };

    layerProto.getCapabilitiesPromise = function () {
        return this._capabilitiesPromise;
    };

    layerProto.getResolutions = function () {
        return this.wrap.getResolutions();
    };

    layerProto.setResolutions = function (resolutions) {
        this.wrap.setResolutions(resolutions);
    };

    //Devuelve un array de subLayers cuyo nombre o descripción contenga el texto indicado
    //case insensitive
    layerProto.searchSubLayers = function (text) {
        if (!this.patternFn) {
            this.patternFn = function (t) {
                t = t.replace(/[^a-z\dáéíóúüñ]/gi, '\\' + '$&');
                t = t.replace(/(a|á)/gi, "(a|á)");
                t = t.replace(/(e|é)/gi, "(e|é)");
                t = t.replace(/(i|í)/gi, "(i|í)");
                t = t.replace(/(o|ó)/gi, "(o|ó)");
                t = t.replace(/(u|ú|ü)/gi, "(u|ú|ü)");
                t = t.replace(/n/gi, "(n|ñ)");
                return t;
            }
        }
        if (text && text.length && text.length >= 3) {
            var self = this;
            var layers = null;
            /*URI:Si la cadena a buscar contiene a la busqueda anterior, por ejemplo, antes he buscado "cat" y ahora busco "cata" porque esto escribiendo "catastro" ...
            en vez de buscar en todas las capas del servicio busco en los resultados encotrados en la búsqueda anterior */
            if (this.lastPattern && text.indexOf(this.lastPattern) >= 0) {
                layers = this.lastMatches
            }
            else {
                /*si se ha definido el parametro layers de esta capa en configuraci\u00f3n filtro las capas del capability para que busque solo en las capas que est\u00e9n en 
                configuraci\u00f3n y sus hijas*/
                if (self.availableNames && self.availableNames.length > 0) {
                    layers = []
                    for (var i = 0; i < self.availableNames.length; i++) {
                        var layer = self.getLayerNodeByName(self.availableNames[i]);
                        if (layer) {
                            layers[layers.length] = layer;
                            layers = layers.concat(self.getChildrenLayers(layer));
                        }
                    }
                }
                else {
                    layers = self.wrap.getAllLayerNodes();
                }
            }

            var filter = this.patternFn(text);
            var re = new RegExp(filter, "i");

            var matches = layers.map(function (ly, ix) {
                delete ly.tcScore;

                ly.tcPosition = ix;

                self.wrap.normalizeLayerNode(ly);

                var title = ly.Title.trim();
                var res = re.exec(title);
                var titleIx = res ? res.index : -1;
                var abstractIx = -1;
                if (ly.Abstract) {
                    var abs = ly.Abstract.trim();
                    var res2 = re.exec(abs);
                    abstractIx = res2 ? res2.index : -1;
                }

                if (res && title == res[0])
                    ly.tcScore = 20;
                else if (titleIx == 0)
                    ly.tcScore = 15;
                else if (titleIx > -1)
                    ly.tcScore = 10;
                else if (abstractIx == 0)
                    ly.tcScore = 5;
                else if (abstractIx > -1)
                    ly.tcScore = 1;

                if (ly.tcScore)
                    return ly;
                else
                    return null;
            })
                .filter(function (elto) {
                    return elto != null;
                })
                .sort(function (a, b) {
                    if (b.tcScore === a.tcScore) {
                        //si la puntuación es la misma reordenamos por título
                        var titleA = TC.Util.replaceAccent(a.Title);
                        var titleB = TC.Util.replaceAccent(b.Title);
                        if (titleA < titleB) return -1;
                        if (titleA > titleB) return 1;
                        return 0;
                    }
                    else
                        return b.tcScore - a.tcScore;
                });

            this.lastPattern = text;
            this.lastMatches = matches;

            return matches;
        }
        else {
            return [];
        }

    };

    var cleanOgcUrl = function (url) {
        var result = url;
        if (url) {
            var match = url.match(/\??SERVICE=\w+&/i);
            if (match) {
                result = result.replace(match[0], '');
            }
        }
        return result;
    };

    layerProto.getGetCapabilitiesUrl = function () {
        const self = this;
        var url;
        const serviceUrl = self.url;
        const params = {};
        if (self.type === TC.Consts.layerType.WMTS) {
            if (self.options.encoding === TC.Consts.WMTSEncoding.RESTFUL) {
                var suffix = '/1.0.0/WMTSCapabilities.xml';
                const suffixIdx = serviceUrl.indexOf(suffix);
                if (suffixIdx < 0 || suffixIdx < serviceUrl.length - suffix.length) {
                    if (serviceUrl[serviceUrl.length - 1] === '/') {
                        suffix = suffix.substr(1);
                    }
                    url = serviceUrl + suffix;
                }
                else {
                    url = serviceUrl;
                }
            }
            else {
                url = serviceUrl;
                params.SERVICE = 'WMTS';
                params.VERSION = '1.0.0';
                params.REQUEST = 'GetCapabilities';
            }
        }
        else {
            url = serviceUrl;
            params.SERVICE = 'WMS';
            params.VERSION = '1.3.0';
            params.REQUEST = 'GetCapabilities';
        }
        url = url + '?' + TC.Util.getParamString(TC.Util.extend(params, self.queryParams));
        return url;
    };



    layerProto.getGetMapUrl = function () {
        return cleanOgcUrl(this.wrap.getGetMapUrl());
    };

    layerProto.getPreferredInfoFormat = function () {
        const layer = this;
        var result = null;

        const infoFormats = layer.wrap.getInfoFormats();
        if (infoFormats) {
            for (var i = 0; i < TC.wrap.layer.Raster.infoFormatPreference.length; i++) {
                var format = TC.wrap.layer.Raster.infoFormatPreference[i];
                if (infoFormats.indexOf(format) >= 0) {
                    result = format;
                    break;
                }
            }
        }
        return result;
    };

    /**
     * Carga la imagen de leyenda de una capa por POST.
     */
    layerProto.getLegendGraphicImage = function () {
        const self = this;
        return new Promise(function (resolve, reject) {
            //Si ya hemos hecho esta consulta previamente, retornamos la respuesta
            if (self.options.params.base64LegendSrc) {
                return resolve(self.options.params.base64LegendSrc);
            }

            if (typeof window.btoa === 'function') {
                var name = self.names[0];
                var info = self.wrap.getInfo(name);
                var xhr = new XMLHttpRequest();
                var url = info.legend[0].src.split('?'); // Separamos los parámetros de la raíz de la URL
                var dataEntries = url[1].split("&"); // Separamos clave/valor de cada parámetro
                var params = self.options.params.sld_body ? "sld_body=" + self.options.params.sld_body : '';

                for (var i = 0; i < dataEntries.length; i++) {
                    var chunks = dataEntries[i].split('=');

                    if (chunks && chunks.length > 1 && chunks[1]) {
                        params += "&" + dataEntries[i];
                    }
                }
                if (self.options.params.env) {
                    params += "&" + self.options.params.env;
                }

                xhr.open('POST', url[0], true);
                xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");

                xhr.responseType = 'arraybuffer';
                xhr.onload = function (e) {
                    if (this.status === 200) {
                        var uInt8Array = new Uint8Array(this.response);
                        var i = uInt8Array.length;
                        var binaryString = new Array(i);
                        while (i--) {
                            binaryString[i] = String.fromCharCode(uInt8Array[i]);
                        }
                        var data = binaryString.join('');
                        var type = xhr.getResponseHeader('content-type');
                        if (type.indexOf('image') === 0) {
                            var imageSrc;
                            imageSrc = 'data:' + type + ';base64,' + window.btoa(data);
                            self.options.params.base64LegendSrc = imageSrc; //Cacheamos la respuesta
                            resolve(imageSrc);
                        }
                    }
                };
                xhr.send(params);
            } else {
                reject(Error("Función window.btoa no soportada por el navegador"));
            }
        });
    };

    layerProto.getUrl = function (src) {
        var self = this;

        return src;
    };

    // GLS: Según MDN: https://developer.mozilla.org/es/docs/Web/API/WebGL_API/Tutorial/Wtilizando_texturas_en_WebGL
    //    Note: Es importante señalar que la carga de texturas en WebGL sigue reglas de dominio-cruzado; 
    //          Es decir, sólo puede cargar texturas de sitios para los que su contenido tiene aprobación de CORS.

    // Usamos el mismo método que para el capabilities ya que la carga de texturas es igual de restrictiva.
    layerProto.getWebGLUrl = function (src, location) {
        const self = this;
        return new Promise(function (resolve, reject) {

            var _src = !TC.Util.isSecureURL(src) && TC.Util.isSecureURL(TC.Util.toAbsolutePath(self.url)) ? self.getBySSL_(src) : src;

            if (self.ignoreProxification) {
                resolve(_src);
            } else {
                const options = {
                    exportable: true,
                    ignoreProxification: self.ignoreProxification
                };

                self.toolProxification.fetchImage(_src, options).then(function () {
                    self.toolProxification.cacheHost.getAction(_src, options).then(function (cache) {
                        if (cache && cache.action) {
                            resolve(cache.action.call(self.toolProxification, _src));
                        }
                    });
                }).catch(function (e) {
                    reject(Error(e));
                });
            }

            //// IGN francés tiene cabeceras CORS menos en las excepciones que las devuelve en XML así que si da error cargamos imagen en blanco sin hacer más
            //if (self.ignoreProxification) {
            //    setSRC({ src: TC.Consts.BLANK_IMAGE });
            //    return;
            //}

            //return self.capabilitiesUrl_.call(self, !TC.Util.isSecureURL(url) && TC.Util.isSecureURL(TC.Util.toAbsolutePath(self.url)) ? self.getBySSL_(url) : url);        
        });
    };

    layerProto.getFeatureUrl = function (url) {
        var self = this;

        return self.toolProxification.fetch(url).then(function () {
            return self.toolProxification.cacheHost.getAction(url)
                .then(function (cache) {
                    return cache.action.call(self.toolProxification, url);
                })
                .catch(function (error) {
                    return Promise.reject(error);
                })
        }).catch(function (error) {
            return Promise.reject(error);
        });
    };

    // GLS:
    // Busca en capas cargadas la 1º capa que tenga la misma instancia de capabilities. 
    // Recibe una función como parámetro opcional, la cual es invocada para añadir más condiciones en la búsqueda de una capa hermana.
    layerProto.getSiblingLoadedLayer = function (dynamicStatement) {
        var self = this;

        if (!self.map) {
            return null;
        } else {
            var layers = self.map.baseLayers.slice(0).concat(self.map.workLayers.slice(0));

            const matchingLayer = layers.filter(function (elem) {
                return (elem.type === TC.Consts.layerType.WMS ||
                    elem.type === TC.Consts.layerType.WMTS) &&
                    (elem.capabilities === self.capabilities || elem.url === self.url) &&
                    (TC.Util.isFunction(dynamicStatement) ? dynamicStatement(elem) : true);
            })[0];

            return matchingLayer || null;
        }
    };

    layerProto.getImageLoad = function (image, src, location) {
        const self = this;

        const setSRC = function (data) {
            var olImg = image.getImage();

            if (!TC.Util.isSameOrigin(data.src)) {
                if (!self.map || (self.map && self.map.mustBeExportable)) {
                    olImg.crossOrigin = data.crossOrigin !== null ? data.crossOrigin : "anonymous";
                }
            }

            // GLS: si establecemos por atributo directamente no actualiza, mediante setAttribute funciona siempre.
            olImg.setAttribute("src", data.src);

            _get$events.call(self).trigger(TC.Consts.event.TILELOAD, { tile: image });
        };

        // Viene sin nombre desde el control TOC, si es así lo ignoramos.
        if (self.names && self.names.length > 0) {

            const error = function (error) {
                _get$events.call(self).trigger(TC.Consts.event.TILELOADERROR, { tile: image, error: { code: error.status, text: error.statusText } });
                setSRC({ src: TC.Consts.BLANK_IMAGE });
            };

            // comprobamos z/x/y contra el matrixset del capabilities para evitar peticiones 404
            if (self.type === TC.Consts.layerType.WMTS) {
                var z, x, y;
                if (self.encoding != "KVP") {
                    var _src = src.replace('.' + self.format.split('/')[1], '');
                    var parts = _src.split('/').slice(_src.split('/').length - 3).map(function (elm) { return parseInt(elm); });
                    z = parts[0];
                    x = parts[1];
                    y = parts[2];
                } else {
                    var parts = /.*TileMatrix=(\d*)&TileCol=(\d*)&TileRow=(\d*)/i.exec(src);
                    if (parts && parts.length == 4) {
                        parts = parts.slice(1).map(function (elm) { return parseInt(elm); });
                        z = parts[0];
                        x = parts[2];
                        y = parts[1];
                    }
                }

                if (z && x && y) {
                    var wmtsOptions = self.wrap.getWMTSLayer();
                    if (wmtsOptions) {
                        var matrixSet = wmtsOptions.TileMatrixSetLink.filter(function (elm) { return elm.TileMatrixSet === self.matrixSet; });
                        if (matrixSet.length > 0) {

                            if (matrixSet[0].TileMatrixSetLimits.length > 0) {
                                var matrixSetLimits = matrixSet[0].TileMatrixSetLimits.sort(function (a, b) {
                                    if (parseInt(a.TileMatrix) > parseInt(b.TileMatrix))
                                        return 1;
                                    else if (parseInt(a.TileMatrix) < parseInt(b.TileMatrix))
                                        return -1;
                                    else return 0;
                                });

                                var level = matrixSetLimits[z];
                                if (level && self.map && self.map.on3DView) {
                                    if (!(level.MinTileRow <= x && level.MaxTileRow >= x && level.MinTileCol <= y && level.MaxTileCol >= y)) {
                                        console.log('Prevenimos petición fuera de matrix set, cargamos imagen en blanco');
                                        setSRC({ src: TC.Consts.BLANK_IMAGE });
                                        return;
                                    }
                                }
                            }
                        }
                    }
                }
            }

            _get$events.call(self).trigger(TC.Consts.event.BEFORETILELOAD, { tile: image });

            var params = "";
            var isPOST = self.options.method === "POST";
            if (isPOST) {
                var url = src.split('?');
                params = url[1].split("&").filter(function (param) {
                    const values = param.split('=');
                    // eliminamos los valores en blanco y el parámetro layers
                    return values.length > 1 && values[1].trim().length > 0 && values[0].trim().toLowerCase() !== "layers";
                }).join('&');

                self.toolProxification.fetchImageAsBlob(url[0], {
                    type: "POST",
                    data: params,
                    contentType: "application/x-www-form-urlencoded"
                }).then(function (blob) {
                    const imageUrl = URL.createObjectURL(blob);
                    const img = image.getImage();
                    img.onload = function (evt) {
                        URL.revokeObjectURL(imageUrl);
                    };
                    setSRC({ src: imageUrl });
                }).catch(error);

            } else {
                if (!self.ignoreProxification) {
                    self.toolProxification.fetchImage(src, { exportable: !self.map || (self.map && self.map.mustBeExportable) }).then(function (img) {
                        setSRC(img);
                    }).catch(error);
                } else {
                    setSRC({ src: src });
                    var img = image.getImage();

                    if (!TC.Util.isSameOrigin(src)) {
                        if (!self.map || (self.map && self.map.mustBeExportable)) {
                            img.crossOrigin = "anonymous";
                        }
                    }

                    img.onload = function () {
                        _get$events.call(self).trigger(TC.Consts.event.TILELOAD, { tile: image });
                    };
                    img.onerror = function (error) {
                        img.src = TC.Consts.BLANK_IMAGE;
                        _get$events.call(self).trigger(TC.Consts.event.TILELOADERROR, { tile: image, error: { code: error.status, text: error.statusText } });
                    };

                    img.src = self.names.length ? src : TC.Consts.BLANK_IMAGE;
                }
            }
        } else {
            setSRC({ src: TC.Consts.BLANK_IMAGE });
            // lanzamos el evento para gestionar el loading
            _get$events.call(self).trigger(TC.Consts.event.TILELOAD, { tile: image });
        }
    };

    var _get$events = function () {
        const self = this;
        if (self.wrap && self.wrap.$events) {
            return self.wrap.$events;
        }
        return null;
    };

    layerProto.getWFSCapabilitiesPromise = function () {
        const self = this;

        if (typeof (WFSCapabilities) === "undefined") {
            TC.syncLoadJS(TC.apiLocation + 'TC/layer/WFSCapabilitiesParser');
        }        
        const newUrl = this.options.url.replace(/wms/gi, "wfs");
        const _src = !TC.Util.isSecureURL(newUrl) && TC.Util.isSecureURL(TC.Util.toAbsolutePath(newUrl)) ? self.getBySSL_(newUrl) : newUrl;
        const basicUrl = newUrl.substring(newUrl.indexOf("://") < 0 ? 0 : newUrl.indexOf("://") + 3);
        if (TC.WFScapabilities[basicUrl]) {
            if (TC.WFScapabilities[basicUrl] instanceof Promise)
                return TC.WFScapabilities[basicUrl];
            else
                return new Promise(function (resolve, reject) {
                    setTimeout(function () {
                        resolve(TC.WFScapabilities[basicUrl]);
                    }, 100);
                });
        }
        TC.WFScapabilities[basicUrl] = new Promise(function (resolve, reject) {            
            var params = {
            }
            params.SERVICE = 'WFS';
            params.VERSION = '2.0.0';
            params.REQUEST = 'GetCapabilities';

            var url = self.getUrl(_src + '?' + TC.Util.getParamString(params));

            self.toolProxification.fetch(url, { retryAttempts: 2 }).then(function (data) {

                var capabilities
                var xmlDoc;
                const documentElement = data.responseText && (data.responseText.ownerDocument || data.responseText).documentElement;
                const isXMLDoc = documentElement ? documentElement.nodeName !== 'HTML' : false;
                if (isXMLDoc) {
                    xmlDoc = data.responseText;
                }
                else {
                    xmlDoc = (new DOMParser()).parseFromString(data.responseText, 'text/xml');
                }
                //comprueba si el servidor ha devuelto una excepcion

                var errorNode = xmlDoc.getElementsByTagName('ServiceException')[0];
                if (!errorNode) {
                    errorNode = xmlDoc.getElementsByTagName('ExceptionText')[0];
                }
                if (errorNode) {
                    reject(Error(errorNode.innerHTML));
                    return;
                }
                try {
                    capabilities = WFSCapabilities.Parse(xmlDoc);
                }
                catch (err) {
                    reject(err instanceof Error ? err : Error(err));
                    return;
                }

                if (!capabilities.Operations) {
                    reject(null);
                    return;
                }
                var _url = (capabilities.Operations.GetCapabilities.DCP && capabilities.Operations.GetCapabilities.DCP.HTTP.Get["xlink:href"]) || capabilities.Operations.GetCapabilities.DCPType[0].HTTP.Get.onlineResource
                TC.WFScapabilities[_url] = capabilities;
                TC.WFScapabilities[basicUrl] = capabilities;
                resolve(capabilities);
            }).catch(function (error) {
                //reject(Error(capabilitiesError(layer, dataError)));
                reject(error instanceof Error ? error : Error(error));
            });
        });
        return TC.WFScapabilities[basicUrl];
    };

    layerProto.getFallbackLayer = function () {
        const self = this;
        if (self.fallbackLayer instanceof TC.Layer) {
            return self.fallbackLayer;
        }
        if (self.options.fallbackLayer) {
            var fbLayer = self.options.fallbackLayer;
            if (typeof fbLayer === 'string') {
                const ablCollection = self.map ? self.map.options.availableBaseLayers : TC.Cfg.availableBaseLayers;
                ablCollection.forEach(function (baseLayer) {
                    if (self.options.fallbackLayer === baseLayer.id) {
                        self.fallbackLayer = new TC.layer.Raster(TC.Util.extend({}, baseLayer, { isBase: true, stealth: true, map: self.map }));
                        self.fallbackLayer.firstOption = self;
                    }
                });
            }
            else if (fbLayer instanceof TC.Layer) {
                self.fallbackLayer = fbLayer;
                self.fallbackLayer.firstOption = self;
            }
            else {
                self.fallbackLayer = new TC.layer.Raster(TC.Util.extend({}, fbLayer, {
                    id: TC.getUID(),
                    isBase: true,
                    stealth: true,
                    title: layer.title,
                    map: self.map
                }));
                self.fallbackLayer.firstOption = self;
            }
            return self.fallbackLayer;
        }
        return null;
    };
})();
var esriParser = {
    parse: function (text) {
        var result = [];
        var dom = (new DOMParser()).parseFromString(text, 'text/xml');
        if (dom.documentElement.tagName === 'FeatureInfoResponse') {
            var fiCollections = dom.documentElement.getElementsByTagName('FeatureInfoCollection');
            for (var i = 0, len = fiCollections.length; i < len; i++) {
                var fic = fiCollections[i];
                var layerName = fic.getAttribute('layername');
                var fInfos = fic.getElementsByTagName('FeatureInfo');
                for (var j = 0, lenj = fInfos.length; j < lenj; j++) {
                    var fields = fInfos[j].getElementsByTagName('Field');
                    var attributes = {};
                    for (var k = 0, lenk = fields.length; k < lenk; k++) {
                        var field = fields[k];
                        attributes[getElementText(field.getElementsByTagName('FieldName')[0])] = getElementText(field.getElementsByTagName('FieldValue')[0]);
                    }
                    var feature = new ol.Feature(attributes);
                    feature.setId(layerName + '.' + TC.getUID());
                    result[result.length] = feature;
                }
            }
        }
        return result;
    }
};
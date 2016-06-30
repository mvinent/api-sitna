﻿
TC.control = TC.control || {};

if (!TC.Control) {
    TC.syncLoadJS(TC.apiLocation + 'TC/Control.js');
}

TC.control.State = function (options) {
    var self = this;

    self.map = null;

    self.CUSTOMEVENT = '.tc';
    self.options = $.extend({}, arguments.length > 1 ? arguments[1] : arguments[0]);
};

TC.inherit(TC.control.State, TC.Control);

(function () {
    var ctlProto = TC.control.State.prototype;

    ctlProto.render = function (callback) {
        //no hay nada que renderizar
    };

    ctlProto.register = function (map) {
        var self = this;
        self.map = map;

        // eventos a los que estamos suscritos para obtener el estado
        var events = [TC.Consts.event.LAYERCATALOGADD, TC.Consts.event.LAYERADD, TC.Consts.event.LAYERORDER, TC.Consts.event.LAYERREMOVE, TC.Consts.event.LAYEROPACITY, TC.Consts.event.LAYERVISIBILITY, TC.Consts.event.ZOOM, TC.Consts.event.BASELAYERCHANGE];
        self.events = events.join(' ');

        // gestión siguiente - anterior
        self.map.on(TC.Consts.event.MAPLOAD, function () {

            //setTimeout(function () {

            map.loaded(function () {
                $.when(self.checkLocation()).then(function () {

                    // registramos el estado inicial                
                    self.replaceCurrent = true;
                    self.addToHistory();

                    // nos suscribimos a los eventos para registrar el estado en cada uno de ellos
                    map.on(self.events, $.proxy(self.addToHistory, self));

                    // gestión siguiente - anterior
                    window.addEventListener('popstate', function (e) {
                        if (e && e.state != null) {

                            self.registerState = false;

                            // eliminamos la suscripción para no registrar el cambio de estado que vamos a provocar
                            map.off(self.events, $.proxy(self.addToHistory, self));

                            // gestionamos la actualización para volver a suscribirnos a los eventos del mapa                        
                            $.when(self.loadIntoMap(e.state)).then(function () {
                                map.on(self.events, $.proxy(self.addToHistory, self));
                            });
                        }

                    });
                });
            });

                

           // }, 2000);
            // si existe un hash aplicamos
            
        });
    };

    // gestión siguiente - anterior
    ctlProto.addToHistory = function (e) {
        var self = this;

        var state = self.getMapState();

        if (self.replaceCurrent) {
            window.history.replaceState(state, null, null);
            delete self.replaceCurrent;

            return;
        } else {

            if (self.registerState != undefined && !self.registerState) {
                self.registerState = true;
                return;
            }

            var saveState = function () {
                window.history.pushState(state, null, window.location.href.split('#').shift() + '#' + self.utf8ToBase64(state));
            };

            if (e) {
                switch (true) {
                    case (e.type == TC.Consts.event.BASELAYERCHANGE.replace(self.CUSTOMEVENT, '')):
                    case (e.type == TC.Consts.event.ZOOM.replace(self.CUSTOMEVENT, '')):
                    case (e.type == TC.Consts.event.LAYERORDER.replace(self.CUSTOMEVENT, '')):
                        saveState();
                        break;
                    case (e.type.toLowerCase().indexOf("LAYER".toLowerCase()) > -1):
                        // unicamente modifico el hash si la capa es WMS
                        if (e.layer.type == TC.Consts.layerType.WMS)
                            saveState();
                        break;
                }
            }
        }
    };

    // gestión siguiente - anterior
    ctlProto.getMapState = function () {
        var self = this;
        var map = self.map;
        var state = {};

        var ext = map.getExtent();
        for (var i = 0; i < ext.length; i++) {
            if (Math.abs(ext[i]) > 180)
                ext[i] = Math.floor(ext[i] * 1000) / 1000;
        }
        state.ext = ext;

        //determinar capa base
        state.base = map.getBaseLayer().id;

        //capas cargadas
        state.capas = [];

        var layer, entry;
        for (var i = 0; i < map.workLayers.length; i++) {
            layer = map.workLayers[i];
            if (layer.type == "WMS") {
                if (layer.layerNames && layer.layerNames.length) {
                    entry = {
                        u: TC.Util.isOnCapabilities(layer.url.indexOf(window.location.protocol) < 0 ? layer.url.replace(TC.Util.regex.PROTOCOL, window.location.protocol) : layer.url),
                        n: layer.layerNames[0], o: layer.wrap.getLayer().getOpacity(), v: layer.getVisibility(), h: layer.options.hideTitle
                    };
                    
                    state.capas.push(entry);
                }
            }
        }

        return jsonpack.pack(state);
    };
    /**
     * Retorna el JSON que representa el estado del mapa codificado para ser utilizado en una URL.
     */
    ctlProto.getMapStateBase64UrlEncoded = function () {
        var state = this.getMapState();
        return this.utf8ToBase64(state);
    };
    /**
     * Convierte a Base64.
     */
    ctlProto.utf8ToBase64 = function (str) {
        return window.btoa(unescape(encodeURIComponent(str)));
    };
    /**
     * Decodifica un string en Base64.
     */
    ctlProto.base64ToUtf8 = function (str) {
        return decodeURIComponent(escape(window.atob(str)));
    };

    ctlProto.clearMap = function () {
        var self = this;
        var map = self.map;

        var layersToRemove = [];
        map.workLayers.forEach(function (layer) {
            if (layer.type != "vector") {
                layersToRemove.push(layer);
            }
        });

        for (var i = 0; i < layersToRemove.length; i++) {
            map.removeLayer(layersToRemove[i]);
        }
    };

    ctlProto.loadIntoMap = function (stringOrJson) {
        var self = this;

        var done = new $.Deferred(); // GLS lo añado para poder gestionar el final de la actualización de estado y volver a suscribirme a los eventos del mapa
        var promises = [];

        var obj;
        if (typeof (stringOrJson) == "string") {
            try {
                obj = jsonpack.unpack(stringOrJson);
            }
            catch (error) {
                obj = JSON.parse(stringOrJson);
            }
        } else {
            obj = stringOrJson;
        }

        if (obj) {
            var map = self.map;

            //capa base
            if (obj.base != map.getBaseLayer().id) map.setBaseLayer(obj.base);

            //extent
            if (obj.ext) promises.push(map.setExtent(obj.ext));

            //capas cargadas        
            //borrar primero
            self.clearMap();

            obj.capas.forEach(function (capa) {
                var op = capa.o;
                var visibility = capa.v;

                // añado como promesa cada una de las capas que se añaden
                promises.push(self.map.addLayer({
                    id: TC.getUID(),
                    url: TC.Util.isOnCapabilities(capa.u, capa.u.indexOf(window.location.protocol) < 0) || capa.u,
                    hideTitle: capa.h,
                    layerNames: [capa.n],
                    renderOptions: {
                        opacity: capa.o,
                        hide: !capa.v
                    }
                }).then(function (layer) {
                    var rootNode = layer.wrap.getRootLayerNode();
                    layer.title = rootNode.Title || rootNode.title;
                    layer.setOpacity(op);
                    layer.setVisibility(visibility);

                    map.$events.trigger($.Event(TC.Consts.event.LAYERCATALOGADD, { layer: layer }));
                }));
            });

            $.when.apply($, promises).done(function () {
                done.resolve();
            });
        }

        return done;
    };

    ctlProto._checkLocation = function (hash) {
        var self = this;
        var done = new $.Deferred();

        if (!self.loadingCtrl)
            self.loadingCtrl = self.map.getControlsByClass("TC.control.LoadingIndicator")[0];

        if (!self.hasWait)
            self.hasWait = self.loadingCtrl.addWait();

        var resolved = function () {
            self.loadingCtrl.removeWait(self.hasWait);
            delete self.hasWait;
            done.resolve();
        };

        if (hash && hash.length > 1) {
            hash = hash.substr(1);

            var obj;
            try {
                obj = jsonpack.unpack(this.base64ToUtf8(hash));
            }
            catch (error) {
                obj = JSON.parse(this.base64ToUtf8(hash));
            }

            if (obj) {
                $.when(self.loadIntoMap(obj)).then(function () {
                    resolved();
                });
            } else resolved();
        } else resolved();

        return done;
    };

    ctlProto.checkLocation = function () {
        var self = this;

        return self._checkLocation(window.location.hash);
    };

})();

/*
 Copyright (c) 2013, Rodrigo González, Sapienlab All Rights Reserved.
 Available via MIT LICENSE. See https://github.com/roro89/jsonpack/blob/master/LICENSE.md for details.
 */
(function (define) {

    define([], function () {

        var TOKEN_TRUE = -1;
        var TOKEN_FALSE = -2;
        var TOKEN_NULL = -3;
        var TOKEN_EMPTY_STRING = -4;
        var TOKEN_UNDEFINED = -5;

        var pack = function (json, options) {

            // Canonizes the options
            options = options || {};

            // A shorthand for debugging
            var verbose = options.verbose || false;

            verbose && console.log('Normalize the JSON Object');

            // JSON as Javascript Object (Not string representation)
            json = typeof json === 'string' ? this.JSON.parse(json) : json;

            verbose && console.log('Creating a empty dictionary');

            // The dictionary
            var dictionary = {
                strings: [],
                integers: [],
                floats: []
            };

            verbose && console.log('Creating the AST');

            // The AST
            var ast = (function recursiveAstBuilder(item) {

                verbose && console.log('Calling recursiveAstBuilder with ' + this.JSON.stringify(item));

                // The type of the item
                var type = typeof item;

                // Case 7: The item is null
                if (item === null) {
                    return {
                        type: 'null',
                        index: TOKEN_NULL
                    };
                }

                //add undefined 
                if (typeof item === 'undefined') {
                    return {
                        type: 'undefined',
                        index: TOKEN_UNDEFINED
                    };
                }

                // Case 1: The item is Array Object
                if (item instanceof Array) {

                    // Create a new sub-AST of type Array (@)
                    var ast = ['@'];

                    // Add each items
                    for (var i in item) {

                        if (!item.hasOwnProperty(i)) continue;

                        ast.push(recursiveAstBuilder(item[i]));
                    }

                    // And return
                    return ast;

                }

                // Case 2: The item is Object
                if (type === 'object') {

                    // Create a new sub-AST of type Object ($)
                    var ast = ['$'];

                    // Add each items
                    for (var key in item) {

                        if (!item.hasOwnProperty(key))
                            continue;

                        ast.push(recursiveAstBuilder(key));
                        ast.push(recursiveAstBuilder(item[key]));
                    }

                    // And return
                    return ast;

                }

                // Case 3: The item empty string
                if (item === '') {
                    return {
                        type: 'empty',
                        index: TOKEN_EMPTY_STRING
                    };
                }

                // Case 4: The item is String
                if (type === 'string') {

                    // The index of that word in the dictionary
                    var index = _indexOf.call(dictionary.strings, item);

                    // If not, add to the dictionary and actualize the index
                    if (index == -1) {
                        dictionary.strings.push(_encode(item));
                        index = dictionary.strings.length - 1;
                    }

                    // Return the token
                    return {
                        type: 'strings',
                        index: index
                    };
                }

                // Case 5: The item is integer
                if (type === 'number' && item % 1 === 0) {

                    // The index of that number in the dictionary
                    var index = _indexOf.call(dictionary.integers, item);

                    // If not, add to the dictionary and actualize the index
                    if (index == -1) {
                        dictionary.integers.push(_base10To36(item));
                        index = dictionary.integers.length - 1;
                    }

                    // Return the token
                    return {
                        type: 'integers',
                        index: index
                    };
                }

                // Case 6: The item is float
                if (type === 'number') {
                    // The index of that number in the dictionary
                    var index = _indexOf.call(dictionary.floats, item);

                    // If not, add to the dictionary and actualize the index
                    if (index == -1) {
                        // Float not use base 36
                        dictionary.floats.push(item);
                        index = dictionary.floats.length - 1;
                    }

                    // Return the token
                    return {
                        type: 'floats',
                        index: index
                    };
                }

                // Case 7: The item is boolean
                if (type === 'boolean') {
                    return {
                        type: 'boolean',
                        index: item ? TOKEN_TRUE : TOKEN_FALSE
                    };
                }

                // Default
                throw new Error('Unexpected argument of type ' + typeof (item));

            })(json);

            // A set of shorthands proxies for the length of the dictionaries
            var stringLength = dictionary.strings.length;
            var integerLength = dictionary.integers.length;
            var floatLength = dictionary.floats.length;

            verbose && console.log('Parsing the dictionary');

            // Create a raw dictionary
            var packed = dictionary.strings.join('|');
            packed += '^' + dictionary.integers.join('|');
            packed += '^' + dictionary.floats.join('|');

            verbose && console.log('Parsing the structure');

            // And add the structure
            packed += '^' + (function recursiveParser(item) {

                verbose && console.log('Calling a recursiveParser with ' + this.JSON.stringify(item));

                // If the item is Array, then is a object of
                // type [object Object] or [object Array]
                if (item instanceof Array) {

                    // The packed resulting
                    var packed = item.shift();

                    for (var i in item) {

                        if (!item.hasOwnProperty(i))
                            continue;

                        packed += recursiveParser(item[i]) + '|';
                    }

                    return (packed[packed.length - 1] === '|' ? packed.slice(0, -1) : packed) + ']';

                }

                // A shorthand proxies
                var type = item.type, index = item.index;

                if (type === 'strings') {
                    // Just return the base 36 of index
                    return _base10To36(index);
                }

                if (type === 'integers') {
                    // Return a base 36 of index plus stringLength offset
                    return _base10To36(stringLength + index);
                }

                if (type === 'floats') {
                    // Return a base 36 of index plus stringLength and integerLength offset
                    return _base10To36(stringLength + integerLength + index);
                }

                if (type === 'boolean') {
                    return item.index;
                }

                if (type === 'null') {
                    return TOKEN_NULL;
                }

                if (type === 'undefined') {
                    return TOKEN_UNDEFINED;
                }

                if (type === 'empty') {
                    return TOKEN_EMPTY_STRING;
                }

                throw new TypeError('The item is alien!');

            })(ast);

            verbose && console.log('Ending parser');

            // If debug, return a internal representation of dictionary and stuff
            if (options.debug)
                return {
                    dictionary: dictionary,
                    ast: ast,
                    packed: packed
                };

            return packed;

        };

        var unpack = function (packed, options) {

            // Canonizes the options
            options = options || {};

            // A raw buffer
            var rawBuffers = packed.split('^');

            // Create a dictionary
            options.verbose && console.log('Building dictionary');
            var dictionary = [];

            // Add the strings values
            var buffer = rawBuffers[0];
            if (buffer !== '') {
                buffer = buffer.split('|');
                options.verbose && console.log('Parse the strings dictionary');
                for (var i = 0, n = buffer.length; i < n; i++) {
                    dictionary.push(_decode(buffer[i]));
                }
            }

            // Add the integers values
            buffer = rawBuffers[1];
            if (buffer !== '') {
                buffer = buffer.split('|');
                options.verbose && console.log('Parse the integers dictionary');
                for (var i = 0, n = buffer.length; i < n; i++) {
                    dictionary.push(_base36To10(buffer[i]));
                }
            }

            // Add the floats values
            buffer = rawBuffers[2];
            if (buffer !== '') {
                buffer = buffer.split('|')
                options.verbose && console.log('Parse the floats dictionary');
                for (var i = 0, n = buffer.length; i < n; i++) {
                    dictionary.push(parseFloat(buffer[i]));
                }
            }
            // Free memory
            delete buffer;

            options.verbose && console.log('Tokenizing the structure');

            // Tokenizer the structure
            var number36 = '';
            var tokens = [];
            var len = rawBuffers[3].length;
            for (var i = 0; i < len; i++) {
                var symbol = rawBuffers[3].charAt(i);
                if (symbol === '|' || symbol === '$' || symbol === '@' || symbol === ']') {
                    if (number36) {
                        tokens.push(_base36To10(number36));
                        number36 = '';
                    }
                    symbol !== '|' && tokens.push(symbol);
                } else {
                    number36 += symbol;
                }
            }

            // A shorthand proxy for tokens.length
            var tokensLength = tokens.length;

            // The index of the next token to read
            var tokensIndex = 0;

            options.verbose && console.log('Starting recursive parser');

            return (function recursiveUnpackerParser() {

                // Maybe '$' (object) or '@' (array)
                var type = tokens[tokensIndex++];

                options.verbose && console.log('Reading collection type ' + (type === '$' ? 'object' : 'Array'));

                // Parse an array
                if (type === '@') {

                    var node = [];

                    for (; tokensIndex < tokensLength; tokensIndex++) {
                        var value = tokens[tokensIndex];
                        options.verbose && console.log('Read ' + value + ' symbol');
                        if (value === ']')
                            return node;
                        if (value === '@' || value === '$') {
                            node.push(recursiveUnpackerParser());
                        } else {
                            switch (value) {
                                case TOKEN_TRUE:
                                    node.push(true);
                                    break;
                                case TOKEN_FALSE:
                                    node.push(false);
                                    break;
                                case TOKEN_NULL:
                                    node.push(null);
                                    break;
                                case TOKEN_UNDEFINED:
                                    node.push(undefined);
                                    break;
                                case TOKEN_EMPTY_STRING:
                                    node.push('');
                                    break;
                                default:
                                    node.push(dictionary[value]);
                            }

                        }
                    }

                    options.verbose && console.log('Parsed ' + this.JSON.stringify(node));

                    return node;

                }

                // Parse a object
                if (type === '$') {
                    var node = {};

                    for (; tokensIndex < tokensLength; tokensIndex++) {

                        var key = tokens[tokensIndex];

                        if (key === ']')
                            return node;

                        if (key === TOKEN_EMPTY_STRING)
                            key = '';
                        else
                            key = dictionary[key];

                        var value = tokens[++tokensIndex];

                        if (value === '@' || value === '$') {
                            node[key] = recursiveUnpackerParser();
                        } else {
                            switch (value) {
                                case TOKEN_TRUE:
                                    node[key] = true;
                                    break;
                                case TOKEN_FALSE:
                                    node[key] = false;
                                    break;
                                case TOKEN_NULL:
                                    node[key] = null;
                                    break;
                                case TOKEN_UNDEFINED:
                                    node[key] = undefined;
                                    break;
                                case TOKEN_EMPTY_STRING:
                                    node[key] = '';
                                    break;
                                default:
                                    node[key] = dictionary[value];
                            }

                        }
                    }

                    options.verbose && console.log('Parsed ' + this.JSON.stringify(node));

                    return node;
                }

                throw new TypeError('Bad token ' + type + ' isn\'t a type');

            })();

        }
        /**
		 * Get the index value of the dictionary
		 * @param {Object} dictionary a object that have two array attributes: 'string' and 'number'
		 * @param {Object} data
		 */
        var _indexOfDictionary = function (dictionary, value) {

            // The type of the value
            var type = typeof value;

            // If is boolean, return a boolean token
            if (type === 'boolean')
                return value ? TOKEN_TRUE : TOKEN_FALSE;

            // If is null, return a... yes! the null token
            if (value === null)
                return TOKEN_NULL;

            //add undefined
            if (typeof value === 'undefined')
                return TOKEN_UNDEFINED;


            if (value === '') {
                return TOKEN_EMPTY_STRING;
            }

            if (type === 'string') {
                value = _encode(value);
                var index = _indexOf.call(dictionary.strings, value);
                if (index === -1) {
                    dictionary.strings.push(value);
                    index = dictionary.strings.length - 1;
                }
            }

            // If has an invalid JSON type (example a function)
            if (type !== 'string' && type !== 'number') {
                throw new Error('The type is not a JSON type');
            };

            if (type === 'string') {// string
                value = _encode(value);
            } else if (value % 1 === 0) {// integer
                value = _base10To36(value);
            } else {// float

            }

            // If is number, "serialize" the value
            value = type === 'number' ? _base10To36(value) : _encode(value);

            // Retrieve the index of that value in the dictionary
            var index = _indexOf.call(dictionary[type], value);

            // If that value is not in the dictionary
            if (index === -1) {
                // Push the value
                dictionary[type].push(value);
                // And return their index
                index = dictionary[type].length - 1;
            }

            // If the type is a number, then add the '+'  prefix character
            // to differentiate that they is a number index. If not, then
            // just return a 36-based representation of the index
            return type === 'number' ? '+' + index : index;

        };

        var _encode = function (str) {
            if (typeof str !== 'string')
                return str;

            return str.replace(/[\+ \|\^\%]/g, function (a) {
                return ({
                    ' ': '+',
                    '+': '%2B',
                    '|': '%7C',
                    '^': '%5E',
                    '%': '%25'
                })[a]
            });
        };

        var _decode = function (str) {
            if (typeof str !== 'string')
                return str;

            return str.replace(/\+|%2B|%7C|%5E|%25/g, function (a) {
                return ({
                    '+': ' ',
                    '%2B': '+',
                    '%7C': '|',
                    '%5E': '^',
                    '%25': '%'
                })[a]
            })
        };

        var _base10To36 = function (number) {
            return Number.prototype.toString.call(number, 36).toUpperCase();
        };

        var _base36To10 = function (number) {
            return parseInt(number, 36);
        };

        var _indexOf = Array.prototype.indexOf ||
		function (obj, start) {
		    for (var i = (start || 0), j = this.length; i < j; i++) {
		        if (this[i] === obj) {
		            return i;
		        }
		    }
		    return -1;
		};

        return {
            JSON: JSON,
            pack: pack,
            unpack: unpack
        };

    });

})(typeof define == 'undefined' || !define.amd ? function (deps, factory) {
    var jsonpack = factory();
    if (typeof exports != 'undefined')
        for (var key in jsonpack)
            exports[key] = jsonpack[key];
    else
        window.jsonpack = jsonpack;
} : define);
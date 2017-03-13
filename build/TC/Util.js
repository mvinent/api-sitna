var TC = TC || {};

(function () {
    // Polyfill para IE
    Number.isInteger = Number.isInteger || function (value) {
        return typeof value === "number" &&
        isFinite(value) &&
        Math.floor(value) === value;
    };

    // GLS: Parche: Chrome no formatea correctamente los n\u00fameros en euskera, establece como separador de decimales el (.)
    var toLocaleString = Number.prototype.toLocaleString;
    Number.prototype.toLocaleString = function (locale, options) {
        if (locale == "eu-ES" && !TC.Util.detectIE()) {
            var sNum = toLocaleString.apply(this, arguments);
            sNum = sNum.replace(/\,/g, '.')
            if (!(Math.floor(this) == this && Number.isInteger(Math.floor(this))))
                sNum = sNum.replace(/.([^.]*)$/, ",$1");

            return sNum;
        }
        else
            return toLocaleString.apply(this, arguments);
    }

    var iconUrlCache = {};
    var markerGroupClassCache = {};

    var path1 = ["Capability", "Request", "GetMap", "DCPType", "0", "HTTP", "Get", "OnlineResource"];
    var path2 = ["OperationsMetadata", "GetTile", "DCP", "HTTP", "Get", "0", "href"];
    var getOnPath = function (obj, p, i) {
        if (i < p.length - 1) {
            if (obj.hasOwnProperty(p[i]))
                return getOnPath(obj[p[i]], p, ++i);
            else return null;
        } else {
            return obj[p[i]];
        }
    };

    TC.Util = TC.Util || {

        getMapLocale: function (map) {
            return map.options && map.options.locale && map.options.locale.replace('_', '-') || "es-ES";
        },

        regex: {
            PROTOCOL: /(^https?:)/i
        },

        isOnCapabilities: function (url) {
            var withProtocol = arguments.length == 2 ? arguments[1] : true;
            var testUrl = !withProtocol ? url.replace(TC.Util.regex.PROTOCOL, "") : url;

            if (withProtocol) {
                if (TC.capabilities[testUrl])
                    return url;
            } else {
                for (var c in TC.capabilities) {
                    if (c.replace(TC.Util.regex.PROTOCOL, "") == testUrl)
                        return c;
                }
            }

            for (c in TC.capabilities) {
                var u = getOnPath(TC.capabilities[c], path1, 0) || getOnPath(TC.capabilities[c], path2, 0);

                if (u && withProtocol && url == u) return u;
                else if (u && url.replace(TC.Util.regex.PROTOCOL, "") == u.replace(TC.Util.regex.PROTOCOL, "")) return u;
            }

            return url;
        },

        reqGetMapOnCapabilities: function (url) {
            var withProtocol = arguments.length == 2 ? arguments[1] : true;
            var testUrl = !withProtocol ? url.replace(TC.Util.regex.PROTOCOL, "") : url;

            var _get = function (caps) {
                var u = getOnPath(caps, path1, 0) || getOnPath(caps, path2, 0);
                if (u)
                    return !withProtocol ? u.split('?')[0].replace(TC.Util.regex.PROTOCOL, "") : u.split('?')[0];

                return null;
            };
            if (TC.capabilities[url]) {
                return _get(TC.capabilities[url]);
            }

            return null;
        },

        getFNFromString: function (fnName) {
            var scope = window;
            var scopeSplit = fnName.split('.');
            for (i = 0; i < scopeSplit.length - 1; i++) {
                scope = scope[scopeSplit[i]];

                if (scope == undefined) return;
            }

            return scope[scopeSplit[scopeSplit.length - 1]];
        },

        isURL: function (text) {
            return /^(http|https|ftp|mailto)\:\/\//i.test(text);
        },

        isSameOrigin: function (uri) {
            var result = uri.indexOf("http") !== 0 && uri.indexOf("//") !== 0;
            var urlParts = !result && uri.match(TC.Consts.url.SPLIT_REGEX);
            if (urlParts) {
                var location = window.location;
                var uProtocol = urlParts[1];
                result =
                    (uProtocol == location.protocol || uProtocol == undefined) &&
                    urlParts[3] == location.hostname;
                var uPort = urlParts[4], lPort = location.port;
                if (uPort != 80 && uPort !== "" || lPort != "80" && lPort !== "") {
                    result = result && uPort == lPort;
                }
            }
            return result;
        },

        addProtocol: function (uri) {
            var result = uri;
            if (uri && uri.indexOf('//') === 0) {
                result = location.protocol + uri;
            }
            return result;
        },

        /* 
        * getDiv: returns HTML element or null if the parameter is invalid
        * Parameter: string with element ID or HTML element
        */
        getDiv: function (div) {
            var result;
            if (typeof div === 'string') {
                result = document.getElementById(div);
            }
            else if ($(div).length == 1) {
                result = div;
            }
            else {
                result = document.createElement('div');
            }
            return result;
        },

        /* 
        * getBackgroundUrlFromCss: devuelve la URL de background-image en CSS
        * Parameter: string con nombre de clase
        */
        getBackgroundUrlFromCss: function (cssClass) {
            var result = '';

            if (iconUrlCache[cssClass] !== undefined) {
                result = iconUrlCache[cssClass];
            }
            else {
                var iconDiv = $('<div style="display:none">').addClass(cssClass).appendTo('body');
                // The regular expression is nongreedy (.*?), otherwise in FF and IE it gets 'url_to_image"'
                var match = /^url\(['"]?(.*?)['"]?\)$/gi.exec(iconDiv.css('background-image'));
                if (match && match.length > 1) {
                    result = match[match.length - 1];
                }
                iconDiv.remove();
                iconUrlCache[cssClass] = result;
            }
            return result;
        },

        getPointIconUrl: function getPointIconUrl(options) {
            var result = null;
            if (options.url) {
                result = options.url;
            }
            else {
                var className;
                if (typeof options.cssClass === 'string') {
                    className = options.cssClass;
                }
                else {
                    var classes = options.classes || TC.Cfg.styles.marker.classes;
                    className = classes[0];
                    if (options.group) {
                        if (markerGroupClassCache[options.group] === undefined) {
                            var i = 0;
                            for (var key in markerGroupClassCache) {
                                i++;
                            }
                            i = i % classes.length;
                            markerGroupClassCache[options.group] = classes[i];
                        }
                        className = markerGroupClassCache[options.group];
                    }
                }
                result = TC.Util.getBackgroundUrlFromCss(className);
            }
            if (!result && options !== TC.Cfg.styles.point && options.cssClass !== '') {
                result = getPointIconUrl(TC.Cfg.styles.point);
            }
            return result;
        },

        /* 
        * addPathToTree: a\u00f1ade a un array a un \u00e1rbol, cada elemento en un nivel anidado
        * Parameters: array, nodo de \u00e1rbol, [\u00edndice]
        * Returns: \u00faltimo nodo insertado, null si ya exist\u00eda la ruta
        */
        addArrayToTree: function addArrayToTree(path, treeNode, index) {
            var result = null;
            var found = false;
            index = index || 0;
            var name = path[index];
            if (name) {
                var n;
                for (var i = 0, len = treeNode.children.length; i < len; i++) {
                    n = treeNode.children[i];
                    if (n.name === name) {
                        found = true;
                        var r = addArrayToTree(path, n, index + 1);
                        if (r) {
                            result = r;
                        }
                        break;
                    }
                }
                if (!found) {
                    n = { name: name, title: name, uid: '/' + path.slice(0, index + 1).join('/'), children: [] };
                    treeNode.children.push(n);
                    result = n;
                }
            }
            return result;
        },

        parseCoords: function (text) {
            var result = null;

            var _parseGeoCoord = function (text) {
                var t = text;
                var result = {};
                result.type = TC.Consts.GEOGRAPHIC;
                var idx = t.indexOf('\u00B0');
                result.value = parseFloat(t.substr(0, idx));
                t = t.substr(idx + 1);
                idx = t.indexOf('\'');
                if (idx >= 0) {
                    var v = parseFloat(t.substr(0, idx)) / 60;
                    if (result.value >= 0) {
                        result.value += v;
                    }
                    else {
                        result.value -= v;
                    }
                    t = t.substr(idx + 1);
                    idx = t.indexOf('\'');
                    if (idx >= 0) {
                        v = parseFloat(t.substr(0, idx).replace(',', '.')) / 3600;
                        if (result.value >= 0) {
                            result.value += v;
                        }
                        else {
                            result.value -= v;
                        }
                    }
                }
                return result;
            };

            var _parseCoord = function (text) {
                var t = $.trim(text);
                // nnºnn'nn''N
                if (t.match(/^1?\d{0,2}\s*\u00B0(\s*\d{1,2}\s*'(\s*\d{1,2}([.,]\d+)?\s*'')?)?\s*[NnSsWwOoEe]$/g)) {
                    switch (t[t.length - 1]) {
                        case 'S':
                        case 's':
                        case 'W':
                        case 'w':
                        case 'O':
                        case 'o':
                            t = '-' + t;
                            break;
                    }
                    t = t.substr(0, t.length - 1);
                    return _parseGeoCoord(t);
                }
                // +nnºnn'nn''
                if (t.match(/^[+-]?1?\d{0,2}\s*\u00B0(\s*\d{1,2}\s*'(\s*\d{1,2}([.,]\d+)?\s*'')?)?$/g)) {
                    return _parseGeoCoord(t);
                }
                // nn.nn N
                if (t.match(/^1?\d{0,2}([.,]\d+)?\s*\u00B0?\s*[NnSsWwOoEe]$/g)) {
                    var result = { type: TC.Consts.GEOGRAPHIC, value: parseFloat(t.substr(0, t.length - 1).replace(',', '.')) };
                    if (t.match(/[SsWwOo]$/)) {
                        result.value = -result.value;
                    }
                    return result;
                }
                // +nn.nn
                if (t.match(/^[+-]?1?\d{0,2}([.,]\d+)?\s*\u00B0?$/g)) {
                    return { type: TC.Consts.GEOGRAPHIC, value: parseFloat(t.replace(',', '.')) };
                }
                // UTM
                if (t.match(/^\d{6,7}([.,]\d+)?$/g)) {
                    return { type: TC.Consts.UTM, value: parseFloat(t.replace(',', '.')) };
                }
                return null;
            };

            text = $.trim(text).toUpperCase();
            var xy = text.split(',');
            if (xy.length === 4) {
                xy = [xy.slice(0, 1).join('.'), xy.slice(2, 3).join('.')];
            }
            else if (xy.length === 1 || xy.length === 3) {
                xy = text.split(' ');
            }
            if (xy.length === 2) {
                var x = _parseCoord(xy[0]);
                var y = _parseCoord(xy[1]);
                if (x !== null && y !== null) {
                    result = [x, y];
                }
            }
            return result;
        },

        reproject: function (coords, sourceCrs, targetCrs) {
            var result;
            var multipoint = true;
            if (!(TC.isLegacy ? window[TC.Consts.PROJ4JSOBJ_LEGACY] : window[TC.Consts.PROJ4JSOBJ])) {
                TC.syncLoadJS(TC.url.proj4js);
            }
            if (!$.isArray(coords) || !$.isArray(coords[0])) {
                multipoint = false;
                coords = [coords];
            }
            TC.loadProjDef(sourceCrs, true);
            TC.loadProjDef(targetCrs, true);
            var sourcePrj = new Proj4js.Proj(sourceCrs);
            var targetPrj = new Proj4js.Proj(targetCrs);
            result = new Array(coords.length);
            for (var i = 0, len = coords.length; i < len; i++) {
                var point = Proj4js.transform(sourcePrj, targetPrj, { x: coords[i][0], y: coords[i][1] });
                result[i] = [point.x, point.y];
            }
            if (!multipoint) {
                result = result[0];
            }
            return result;
        },

        getMetersPerDegree: function (extent) {
            var result = undefined;
            var R = 6370997; // m
            var toRad = function (number) {
                return number * Math.PI / 180;
            };
            if ($.isArray(extent) && extent.length >= 4) {
                var dLat = this.degToRad(extent[3] - extent[1]);
                var sindlat2 = Math.sin(dLat / 2);
                var a = sindlat2 * sindlat2;
                var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                result = R * c / (extent[3] - extent[1]);
            }
            return result;
        },

        radToDeg: function (rad) { // convert radians to degrees
            return rad * 180 / Math.PI;
        },
        degToRad: function (deg) { // convert degrees to radians
            return deg * Math.PI / 180;
        },
        mod: function (n) { // modulo for negative values
            return ((n % (2 * Math.PI)) + (2 * Math.PI)) % (2 * Math.PI);
        },

        getLocaleString: function (locale, key, texts) {
            var result = key;
            if (TC.i18n && TC.i18n[locale]) {
                var text = TC.i18n[locale][key];
                if (text) {
                    result = text;
                    if (texts) {
                        for (var k in texts) {
                            result = result.replace('{' + k + '}', texts[k]);
                        }
                    }
                }
            }
            return result;
        },

        getSimpleMimeType: function (mimeType) {
            var result = '';
            if (mimeType) {
                var end = mimeType.indexOf(';');
                if (end > 0) {
                    mimeType = mimeType.substring(0, end);
                }
                result = mimeType;
            }
            return result;
        },

        getQueryStringParams: function (url) {
            var queryString;
            if (url) {
                var queryIdx = url.indexOf('?');
                if (queryIdx >= 0) {
                    queryString = url.substr(queryIdx);
                    var fragmentIdx = queryString.indexOf('#');
                    if (fragmentIdx >= 0) {
                        queryString = queryString.substr(0, fragmentIdx)
                    }
                }
                else {
                    queryString = '?';
                }
            }
            else {
                queryString = location.search;
            }
            var result = $.map(queryString.replace(/(^\?)/, '').split("&"), function (elm) {
                return elm = elm.split("="), this[elm[0]] = elm[1], this
            }.bind({}))[0];
            delete result[''];
            return result;
        },

        fastUnshift: function (a, elm) {
            var len = a.length;
            while (len) {
                a[len] = a[len - 1];
                len--;
            }
            a[0] = elm;
        },

        storage: {
            getCookie: function (key) {
                return $.cookie(key);
            },
            setCookie: function (key, value, options) {
                return $.cookie(key, value, options);
            },
            getLocalValue: function (key) {
                var result = null;
                if (localStorage && localStorage instanceof Storage) {
                    result = localStorage.getItem(key);
                }
                else {
                    result = TC.Util.storage.getCookie(key);
                }
                return result;
            },
            setLocalValue: function (key, value) {
                if (localStorage && localStorage instanceof Storage) {
                    if (value === undefined) {
                        localStorage.removeItem(key);
                    }
                    else {
                        localStorage.setItem(key, value);
                    }
                }
                else {

                    if (value === undefined) {
                        var exDate = new Date();
                        exDate.setDate(exDate.getDate() - 1);
                        TC.Util.storage.setCookie(key, "", { expires: exDate });
                    }
                    else {
                        TC.Util.storage.setCookie(key, value);
                    }
                }
                return key;
            },
            getSessionLocalValue: function (key) {
                var result = null;
                if (sessionStorage && sessionStorage instanceof Storage) {
                    result = sessionStorage.getItem(key);
                }
                else {
                    result = TC.Util.storage.getCookie(key);
                }
                return result;
            },
            setSessionLocalValue: function (key, value) {
                if (sessionStorage && sessionStorage instanceof Storage) {
                    if (value === undefined) {
                        sessionStorage.removeItem(key);
                    }
                    else {
                        sessionStorage.setItem(key, value);
                    }
                }
                else {

                    if (value === undefined) {
                        var exDate = new Date();
                        exDate.setDate(exDate.getDate() - 1);
                        TC.Util.storage.setCookie(key, "", { expires: exDate });
                    }
                    else {
                        TC.Util.storage.setCookie(key, value);
                    }
                }
                return key;
            }
        },
        detectFirefox: function () {
            if (/Firefox[\/\s](\d+\.\d+)/.test(navigator.userAgent)) //test for Firefox/x.x or Firefox x.x (ignoring remaining digits);
                return new Number(RegExp.$1); // capture x.x portion and store as a number
            else
                return false;
        },
        detectIE: function () {
            var ua = window.navigator.userAgent;

            var msie = ua.indexOf('MSIE ');
            if (msie > 0) {
                // IE 10 or older => return version number
                return parseInt(ua.substring(msie + 5, ua.indexOf('.', msie)), 10);
            }

            var trident = ua.indexOf('Trident/');
            if (trident > 0) {
                // IE 11 => return version number
                var rv = ua.indexOf('rv:');
                return parseInt(ua.substring(rv + 3, ua.indexOf('.', rv)), 10);
            }

            var edge = ua.indexOf('Edge/');
            if (edge > 0) {
                // IE 12 => return version number
                return parseInt(ua.substring(edge + 5, ua.indexOf('.', edge)), 10);
            }

            // other browser
            return false;
        },
        detectChrome: function () {
            return window.chrome;
        },
        detectSafari: function () {
            return !!navigator.userAgent.match(/Version\/[\d\.]+.*Safari/);
        },
        detectMouse: function () {
            if (Modernizr.mq('(pointer:coarse)') && Modernizr.mq('(pointer:fine)'))
                return true;
            if (Modernizr.mq('(pointer:coarse)') && !Modernizr.mq('(pointer:fine)')) {
                var testHover = function () {
                    //console.log('estamos en testHover');
                    var mq = '(hover: hover)',
                    hover = !Modernizr.touch, // fallback if mq4 not supported: no hover for touch
                    mqResult;

                    if ('matchMedia' in window) {
                        //console.log('dispone de matchMedia');
                        mqResult = window.matchMedia(mq);
                        //console.log('resultado de window.matchMedia(mq): ' + mqResult.media);
                        //console.log('mq: ' + mq);
                        if (mqResult.media === mq) {
                            //console.log('es igual');
                            // matchMedia supports hover detection, so we rely on that
                            hover = mqResult.matches;
                            //console.log('va retornar: ' + hover);
                        }
                    } else { console.log('no dispone de matchMedia'); }

                    return hover;
                };

                if (testHover())
                    return true;
                else return false;
            }
            if (!Modernizr.mq('(pointer:coarse)') && Modernizr.mq('(pointer:fine)'))
                return true;
            if (Modernizr.mq('(pointer:none)'))
                return false;
            if (!Modernizr.touch)
                return true;
        },
        detectAndroid: function () {
            return navigator.userAgent.match(/Android/i);
        },
        detectBlackBerry: function () {
            return navigator.userAgent.match(/BlackBerry/i);
        },
        detectIOS: function () {
            return navigator.userAgent.match(/iPhone|iPad|iPod/i);
        },
        detectMobileWindows: function () {
            return navigator.userAgent.match(/IEMobile/i);
        },
        detectMobile: function () {
            return (TC.Util.detectAndroid() || TC.Util.detectIOS() || TC.Util.detectMobileWindows() || TC.Util.detectBlackBerry());
        },
        getElementByNodeName: function (parentNode, nodeName) {
            var colonIndex = nodeName.indexOf(":");
            var tag = nodeName.substr(colonIndex + 1);
            var nodes = parentNode.getElementsByTagNameNS("*", tag);

            for (var i = 0; i < nodes.length; i++) {
                if (nodes[i].nodeName == nodeName)
                    return nodes;
            }
            return undefined;
        },
        removeURLParameter: function (url, parameter) {
            var urlparts = url.toLowerCase().split('?');
            if (urlparts.length >= 2) {

                var prefix = encodeURIComponent(parameter.toLowerCase()) + '=';
                var pars = urlparts[1].split(/[&;]/g);

                //reverse iteration as may be destructive
                for (var i = pars.length; i-- > 0;) {
                    //idiom for string.startsWith
                    if (pars[i].lastIndexOf(prefix, 0) !== -1) {
                        pars.splice(i, 1);
                    }
                }

                url = urlparts[0] + '?' + pars.join('&');
                return url;
            } else {
                return url;
            }
        },

        showModal: function (contentNode, options) {
            var $modal = $(contentNode);
            var options = options || {};

            $modal
                .off('click')
                .removeAttr("hidden");
            $modal.fadeIn(250, function () {
                $modal.on('click', ".tc-modal-close", function (e) {
                    e.stopPropagation();
                    return TC.Util.closeModal(options.closeCallback);
                });
                if ($.isFunction(options.openCallback)) {
                    options.openCallback();
                }
            });
        },

        closeModal: function (callback) {
            $(".tc-modal").hide().find(".tc-modal-window").removeAttr("style").off();

            if (callback)
                callback();
        },

        closeAlert: function (btn) {
            $(btn).parents(".tc-alert").hide();
        },

        getParameterByName: function (name) {
            name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
            var regex = new RegExp("[\\?&]" + name + "=([^&#]*)", "i"),
                results = regex.exec(location.search);
            return results === null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
        },

        downloadFile: function (filename, type, data) {
            var blob = new Blob([data], { type: type });
            if (navigator.msSaveBlob) { // IE 10+
                navigator.msSaveBlob(blob, filename);
            } else {
                var link = document.createElement("a");
                if (link.download !== undefined) { // feature detection
                    // Browsers that support HTML5 download attribute
                    var url = URL.createObjectURL(blob);
                    link.setAttribute("href", url);
                    link.setAttribute("download", filename);
                    link.style.visibility = 'hidden';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                }
            }
        },

        /**
         * Acorta una URL utilizando el servicio de Bit.ly. No funciona para URLs locales.
         */
        shortenUrl: function (url) {
            var shortUrl;

            $.ajax({
                url: "https://api-ssl.bitly.com/v3/shorten",
                data: { access_token: "6c466047309f44bd8173d83e81491648b243ee3d", longUrl: url },
                async: false
            }).done(function (response) {
                shortUrl = response.data.url;
            });

            return shortUrl;
        },

        /**
         * Convierte a Base64.
         */
        utf8ToBase64: function (str) {
            return window.btoa(unescape(encodeURIComponent(str)));
        },

        /**
         * Decodifica un string en Base64.
         */
        base64ToUtf8: function (str) {
            var result;
            try {
                result = decodeURIComponent(escape(window.atob(str)));
            }
            catch (error) {
                result = null;
            }
            return result;
        },

        // Generic helper function that can be used for the three operations:        
        operation: function (list1, list2, comparerFn, operationIsUnion) {
            var result = [];

            for (var i = 0; i < list1.length; i++) {
                var item1 = list1[i],
                    found = false;
                for (var j = 0; j < list2.length; j++) {
                    if (comparerFn(item1, list2[j])) {
                        found = true;
                        break;
                    }
                }
                if (found === operationIsUnion) {
                    result.push(item1);
                }
            }
            return result;
        },

        // Following functions are to be used:
        inBoth: function (list1, list2, comparerFn) {
            return this.operation(list1, list2, comparerFn, true);
        },

        inFirstOnly: function (list1, list2, comparerFn) {
            return this.operation(list1, list2, comparerFn, false);
        },

        inSecondOnly: function (list1, list2, comparerFn) {
            return this.inFirstOnly(list2, list1, comparerFn);
        },

        toDataUrl: function (canvas, backgroundColour) {
            var defaultOptions = { type: 'image/png', encoderOptions: 0.92 };

            var _ref = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : defaultOptions,
                type = _ref.type,
                encoderOptions = _ref.encoderOptions;

            var context = canvas.getContext('2d');

            if (!context) {
                return '';
            }

            var width = canvas.width;
            var height = canvas.height;

            var data = context.getImageData(0, 0, width, height);
            var compositeOperation = context.globalCompositeOperation;

            if (backgroundColour) {

                context.globalCompositeOperation = 'destination-over';
                context.fillStyle = backgroundColour;
                context.fillRect(0, 0, width, height);
            }

            var imageData = canvas.toDataURL(type, encoderOptions);

            if (backgroundColour) {
                context.clearRect(0, 0, width, height);
                context.putImageData(data, 0, 0);
                context.globalCompositeOperation = compositeOperation;
            }

            return imageData;
        },

        imgToDataUrl: function (src, outputFormat) {
            var deferred = $.Deferred();

            var img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = function () {
                var canvas = document.createElement('CANVAS');
                var ctx = canvas.getContext('2d');
                var dataURL;
                canvas.height = this.height;
                canvas.width = this.width;
                ctx.drawImage(this, 0, 0);
                dataURL = TC.Util.toDataUrl(canvas, '#ffffff', {
                    type: outputFormat || 'image/jpeg',
                    encoderOptions: 1.0
                });
                deferred.resolve(dataURL, canvas);
            };
            src = src.replace(/^https?\:/i, "");
            img.src = src;
            if (img.complete || img.complete === undefined) {
                img.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
                img.src = src;
            }

            return deferred.promise();
        },

        addToCanvas: function (canvas, img, position) {
            var cloneCanvas = function (oldCanvas) {

                //create a new canvas
                var newCanvas = document.createElement('canvas');
                var context = newCanvas.getContext('2d');

                //set dimensions
                newCanvas.width = oldCanvas.width;
                newCanvas.height = oldCanvas.height;

                //apply the old canvas to the new one
                context.drawImage(oldCanvas, 0, 0);

                //return the new canvas
                return newCanvas;
            };

            var newCanvas = cloneCanvas(canvas);
            var deferred = $.Deferred();
            var context = newCanvas.getContext('2d');

            var newImage = new Image();
            newImage.src = img;
            newImage.onload = function () {
                context.drawImage(newImage, position.x || 0, position.y || 0);
                deferred.resolve(newCanvas);
            }

            return deferred.promise();
        },

        calculateAspectRatioFit: function (srcWidth, srcHeight, maxWidth, maxHeight) {
            var ratio = Math.min(maxWidth / srcWidth, maxHeight / srcHeight);

            return { width: srcWidth * ratio, height: srcHeight * ratio };
        },

        getFormattedDate: function (date) {
            function pad(s) { return (s < 10) ? '0' + s : s; }

            var d = new Date(date);
            return [d.getFullYear(), pad(d.getMonth() + 1), pad(d.getDate())].join('');

        }
    };
})();
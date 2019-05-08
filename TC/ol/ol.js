﻿; (function (root, factory) {

    if (typeof define === 'function' && define.amd) {
        define(['../../lib/ol/build/ol-debug'], factory);
    } else if (typeof exports === 'object') {
        module.exports = factory(require('../../lib/ol/build/ol-debug'));
    } else {
        root.ol = factory(root.ol);
    }

})(this, function (ol) {
    Math.hypot = Math.hypot || function () {
        var y = 0;
        var length = arguments.length;

        for (var i = 0; i < length; i++) {
            if (arguments[i] === Infinity || arguments[i] === -Infinity) {
                return Infinity;
            }
            y += arguments[i] * arguments[i];
        }
        return Math.sqrt(y);
    };

    // requestAnimationFrame polyfill
    var lastTime = 0;
    var vendors = ['ms', 'moz', 'webkit', 'o'];
    for (var x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
        window.requestAnimationFrame = window[vendors[x] + 'RequestAnimationFrame'];
        window.cancelAnimationFrame = window[vendors[x] + 'CancelAnimationFrame']
            || window[vendors[x] + 'CancelRequestAnimationFrame'];
    }

    if (!window.requestAnimationFrame)
        window.requestAnimationFrame = function (callback, element) {
            var currTime = new Date().getTime();
            var timeToCall = Math.max(0, 16 - (currTime - lastTime));
            var id = window.setTimeout(function () { callback(currTime + timeToCall); },
                timeToCall);
            lastTime = currTime + timeToCall;
            return id;
        };

    if (!window.cancelAnimationFrame)
        window.cancelAnimationFrame = function (id) {
            clearTimeout(id);
        };

    // ol patches
    var MOUSEMOVE = 'mousemove';
    var MOUSEOUT = 'mouseout';
    var MOUSEOVER = 'mouseover';
    var MOUSEENTER = 'mouseenter';

    var cssUrl = TC.url.ol.substr(0, TC.url.ol.lastIndexOf('/'));
    cssUrl = cssUrl.substr(0, cssUrl.lastIndexOf('/') + 1) + 'css/ol.css';
    //TC.loadCSS(cssUrl);

    // OpenLayers usa para las proyecciones geográficas un valor ol.proj.METERS_PER_UNIT[ol.proj.Units.DEGREES], calculado con una esfera, salvo
    // EPSG:4326, en la que usa ol.proj.EPSG4326.METERS_PER_UNIT, calculado con el geoide. Esto hace que las proyecciones en EPSG:4258 salgan desplazadas,
    // pese a que para todos los efectos son iguales a las EPSG:4326. Para evitar eso, introducimos en las 4258 el valor ol.proj.EPSG4326.METERS_PER_UNIT.
    ol.proj.get('EPSG:4258').metersPerUnit_ = ol.proj.EPSG4326.METERS_PER_UNIT;
    ol.proj.get('urn:ogc:def:crs:EPSG::4258').metersPerUnit_ = ol.proj.EPSG4326.METERS_PER_UNIT;
    ol.proj.get('http://www.opengis.net/gml/srs/epsg.xml#4258').metersPerUnit_ = ol.proj.EPSG4326.METERS_PER_UNIT;

    // Reescribimos la obtención de proyección para que soporte códigos tipo EPSG:X, urn:ogc:def:crs:EPSG::X y http://www.opengis.net/gml/srs/epsg.xml#X
    ol.proj.oldGet = ol.proj.get;
    ol.proj.get = function (projectionLike) {
        if (typeof projectionLike === 'string') {
            projectionLike = projectionLike.trim();
            TC.loadProjDef({ crs: projectionLike, sync: true });
        }
        return ol.proj.oldGet.call(this, projectionLike);
    };

    // Reescritura de código para transformar las geometrías de getFeatureInfo que están en un CRS distinto
    ol.format.GMLBase.prototype.readGeometryElement = function (node, objectStack) {
        var context = /** @type {Object} */ (objectStack[0]);
        context['srsName'] = node.firstElementChild.getAttribute('srsName');
        /** @type {ol.geom.Geometry} */

        // Parche para poder leer coordenadas en EPSG:4326 con orden incorrecto (las crea QGIS, por ejemplo)
        if (this instanceof ol.format.GML2CRS84 || this instanceof ol.format.GML3CRS84) {
            if (context.srsName !== 'EPSG:4326' || !context.srsName) {
                throw new Error("Conflicto de CRS");
            }
        }
        if (!context.srsName) {
            context.srsName = this.srsName;
        }
        context.dataProjection = ol.proj.get(context.srsName);
        var geometry = ol.xml.pushParseAndPop(null,
            this.GEOMETRY_PARSERS_, node, objectStack, this);
        if (geometry) {
            return /** @type {ol.geom.Geometry} */ (
                ol.format.Feature.transformWithOptions(geometry, false, context));
        } else {
            return undefined;
        }
    };

    // Reescritura de código para hacerlo compatible con GML generado por inspire:
    // No se puede considerar geometría cualquier cosa que tenga elementos anidados.
    ol.format.GMLBase.prototype.readFeatureElement = function (node, objectStack) {
        var n;
        var fid = node.getAttribute('fid') ||
            ol.xml.getAttributeNS(node, ol.format.GMLBase.GMLNS, 'id');
        var values = {}, geometryName;
        for (n = node.firstElementChild; n; n = n.nextElementSibling) {
            var localName = n.localName;
            // Assume attribute elements have one child node and that the child
            // is a text or CDATA node (to be treated as text).
            // Otherwise assume it is a geometry node.
            if (n.childNodes.length === 0 ||
                (n.childNodes.length === 1 &&
                    (n.firstChild.nodeType === 3 || n.firstChild.nodeType === 4))) {
                var value = ol.xml.getAllTextContent(n, false);
                if (ol.format.GMLBase.ONLY_WHITESPACE_RE_.test(value)) {
                    value = undefined;
                }
                values[localName] = value;
            } else {
                values[localName] = this.readGeometryElement(n, objectStack);
                // boundedBy is an extent and must not be considered as a geometry
                // Tampoco referencePoint
                if (localName !== 'boundedBy' && localName !== 'referencePoint') {
                    geometryName = localName;
                }
            }
        }
        var feature = new ol.Feature(values);
        if (geometryName) {
            feature.setGeometryName(geometryName);
        }
        if (fid) {
            feature.setId(fid);
        }
        return feature;
    };

    // Añadimos el atributo srsDimension para soportar 3D
    ol.format.GML3.prototype._writePosList_ = ol.format.GML3.prototype.writePosList_;
    ol.format.GML3.prototype.writePosList_ = function (node, value, objectStack) {
        this._writePosList_(node, value, objectStack);
        const point = value.getCoordinates()[0];
        if (point && point.length > 2) {
            node.setAttribute('srsDimension', point.length);
        }
    };

    // Cambiamos getCoords_ para que soporte 3D
    ol.format.GML3.prototype._getCoords_ = ol.format.GML3.prototype.getCoords_;
    ol.format.GML3.prototype.getCoords_ = function (point, opt_srsName) {
        var result = this._getCoords_(point, opt_srsName);
        if (point.length > 2) {
            result += ' ' + point[2];
        }
        return result;
    };

    // Cambiamos writePos_ para que soporte 3D
    ol.format.GML3.prototype._writePos_ = ol.format.GML3.prototype.writePos_;
    ol.format.GML3.prototype.writePos_ = function (node, value, objectStack) {
        this._writePos_(node, value, objectStack);
        const point = value.getCoordinates();
        if (point.length > 2) {
            ol.format.XSD.writeStringTextNode(node, ' ' + point[2]);
        }
    };



    // Añadido el espacio de nombres de GML 3.2 al parser
    var gmlNamespace = 'http://www.opengis.net/gml';
    var gml32Namespace = 'http://www.opengis.net/gml/3.2';
    ol.format.GMLBase.prototype.MULTIPOINT_PARSERS_[gml32Namespace] = ol.format.GMLBase.prototype.MULTIPOINT_PARSERS_[gmlNamespace];
    ol.format.GMLBase.prototype.MULTILINESTRING_PARSERS_[gml32Namespace] = ol.format.GMLBase.prototype.MULTILINESTRING_PARSERS_[gmlNamespace];
    ol.format.GMLBase.prototype.MULTIPOLYGON_PARSERS_[gml32Namespace] = ol.format.GMLBase.prototype.MULTIPOLYGON_PARSERS_[gmlNamespace];
    ol.format.GMLBase.prototype.POINTMEMBER_PARSERS_[gml32Namespace] = ol.format.GMLBase.prototype.POINTMEMBER_PARSERS_[gmlNamespace];
    ol.format.GMLBase.prototype.LINESTRINGMEMBER_PARSERS_[gml32Namespace] = ol.format.GMLBase.prototype.LINESTRINGMEMBER_PARSERS_[gmlNamespace];
    ol.format.GMLBase.prototype.POLYGONMEMBER_PARSERS_[gml32Namespace] = ol.format.GMLBase.prototype.POLYGONMEMBER_PARSERS_[gmlNamespace];
    ol.format.GMLBase.prototype.RING_PARSERS[gml32Namespace] = ol.format.GMLBase.prototype.RING_PARSERS[gmlNamespace];
    ol.format.GML3.prototype.GEOMETRY_FLAT_COORDINATES_PARSERS_[gml32Namespace] = ol.format.GML3.prototype.GEOMETRY_FLAT_COORDINATES_PARSERS_[gmlNamespace];
    ol.format.GML3.prototype.FLAT_LINEAR_RINGS_PARSERS_[gml32Namespace] = ol.format.GML3.prototype.FLAT_LINEAR_RINGS_PARSERS_[gmlNamespace];
    ol.format.GML3.prototype.GEOMETRY_PARSERS_[gml32Namespace] = ol.format.GML3.prototype.GEOMETRY_PARSERS_[gmlNamespace];
    ol.format.GML3.prototype.MULTICURVE_PARSERS_[gml32Namespace] = ol.format.GML3.prototype.MULTICURVE_PARSERS_[gmlNamespace];
    ol.format.GML3.prototype.MULTISURFACE_PARSERS_[gml32Namespace] = ol.format.GML3.prototype.MULTISURFACE_PARSERS_[gmlNamespace];
    ol.format.GML3.prototype.CURVEMEMBER_PARSERS_[gml32Namespace] = ol.format.GML3.prototype.CURVEMEMBER_PARSERS_[gmlNamespace];
    ol.format.GML3.prototype.SURFACEMEMBER_PARSERS_[gml32Namespace] = ol.format.GML3.prototype.SURFACEMEMBER_PARSERS_[gmlNamespace];
    ol.format.GML3.prototype.SURFACE_PARSERS_[gml32Namespace] = ol.format.GML3.prototype.SURFACE_PARSERS_[gmlNamespace];
    ol.format.GML3.prototype.CURVE_PARSERS_[gml32Namespace] = ol.format.GML3.prototype.CURVE_PARSERS_[gmlNamespace];
    ol.format.GML3.prototype.ENVELOPE_PARSERS_[gml32Namespace] = ol.format.GML3.prototype.ENVELOPE_PARSERS_[gmlNamespace];
    ol.format.GML3.prototype.PATCHES_PARSERS_[gml32Namespace] = ol.format.GML3.prototype.PATCHES_PARSERS_[gmlNamespace];
    ol.format.GML3.prototype.SEGMENTS_PARSERS_[gml32Namespace] = ol.format.GML3.prototype.SEGMENTS_PARSERS_[gmlNamespace];

    // Rehacemos los estilos por defecto de KML para que se adecúen al de la API
    ol.format.KML._createStyleDefaults_ = ol.format.KML.createStyleDefaults_;
    ol.format.KML.createStyleDefaults_ = function () {
        ol.format.KML._createStyleDefaults_();

        ol.format.KML.DEFAULT_FILL_STYLE_.color_ = getRGBA(TC.Cfg.styles.polygon.fillColor, TC.Cfg.styles.polygon.fillOpacity);
        ol.format.KML.DEFAULT_TEXT_STYLE_.fill_ = new ol.style.Fill({
            color: ol.format.KML.DEFAULT_COLOR_
        });
        ol.format.KML.DEFAULT_STROKE_STYLE_.color_ = getRGBA(TC.Cfg.styles.line.strokeColor, 1);
        ol.format.KML.DEFAULT_STROKE_STYLE_.width_ = TC.Cfg.styles.line.strokeWidth;

        return ol.format.KML.DEFAULT_STYLE_ARRAY_;
    };


    // Reescritura de código para leer las carpetas del KML
    ol.format.KML.prototype._readDocumentOrFolder_ = ol.format.KML.prototype.readDocumentOrFolder_;
    ol.format.KML.prototype.readDocumentOrFolder_ = function (node, objectStack) {
        var result = ol.format.KML.prototype._readDocumentOrFolder_.apply(this, arguments);
        if (node.localName == "Folder") {
            for (var i = 0; i < result.length; i++) {
                var feature = result[i];
                if (!$.isArray(feature._folders)) {
                    feature._folders = [];
                }
                var nameElm = node.getElementsByTagName('name')[0];
                if (nameElm) {
                    //feature._folders.unshift(nameElm.innerHTML || nameElm.textContent);
                    // Versión rápida de unshift
                    TC.Util.fastUnshift(feature._folders, nameElm.innerHTML || nameElm.textContent);
                }
            }
        }
        return result;
    };

    // Creamos un parser para interpretar la plantilla de los bocadillos
    ol.format.KML.readText_ = function (node, objectStack) {
        ol.asserts.assert(node.nodeType == Node.ELEMENT_NODE);
        ol.asserts.assert(node.localName == 'text');
        var s = ol.xml.getAllTextContent(node, false);
        return s.trim();
    };

    //ol.format.KML.DEFAULT_BALLOON_STYLE_ = new ol.style.Text();

    ol.format.KML.BALLOON_STYLE_PARSERS_ = ol.xml.makeStructureNS(
        ol.format.KML.NAMESPACE_URIS_, {
            'text': ol.xml.makeObjectPropertySetter(ol.format.KML.readText_),
        });

    ol.format.KML.BalloonStyleParser_ = function (node, objectStack) {
        ol.asserts.assert(node.nodeType == Node.ELEMENT_NODE);
        ol.asserts.assert(node.localName == 'BalloonStyle');
        // FIXME colorMode
        var object = ol.xml.pushParseAndPop(
            {}, ol.format.KML.BALLOON_STYLE_PARSERS_, node, objectStack);
        if (!goog.isDef(object)) {
            return;
        }
        var styleObject = objectStack[objectStack.length - 1];
        ol.asserts.assert(goog.isObject(styleObject));
        var textStyle = new ol.style.Text({
            text: (object['text'])
        });
        styleObject['balloonStyle'] = textStyle;
    };

    for (var key in ol.format.KML.STYLE_PARSERS_) {
        var parser = ol.format.KML.STYLE_PARSERS_[key];
        parser['BalloonStyle'] = ol.format.KML.BalloonStyleParser_;
    }

    // Parche a esta función para meter la lectura de balloonStyle
    ol.format.KML.readStyle_ = function (node, objectStack) {
        var styleObject = ol.xml.pushParseAndPop(
            {}, ol.format.KML.STYLE_PARSERS_, node, objectStack);
        if (!styleObject) {
            return null;
        }
        var fillStyle = /** @type {ol.style.Fill} */
            ('fillStyle' in styleObject ?
                styleObject['fillStyle'] : ol.format.KML.DEFAULT_FILL_STYLE_);
        var fill = /** @type {boolean|undefined} */ (styleObject['fill']);
        if (fill !== undefined && !fill) {
            fillStyle = null;
        }
        var imageStyle = /** @type {ol.style.Image} */
            ('imageStyle' in styleObject ?
                styleObject['imageStyle'] : ol.format.KML.DEFAULT_IMAGE_STYLE_);
        if (imageStyle == ol.format.KML.DEFAULT_NO_IMAGE_STYLE_) {
            imageStyle = undefined;
        }
        var textStyle = /** @type {ol.style.Text} */
            ('textStyle' in styleObject ?
                styleObject['textStyle'] : ol.format.KML.DEFAULT_TEXT_STYLE_);
        var strokeStyle = /** @type {ol.style.Stroke} */
            ('strokeStyle' in styleObject ?
                styleObject['strokeStyle'] : ol.format.KML.DEFAULT_STROKE_STYLE_);
        var balloonStyle =
            ('balloonStyle' in styleObject ?
                styleObject['balloonStyle'] : ol.format.KML.DEFAULT_BALLOON_STYLE_);

        // GLS: Comento el machaque del estilo de línea por que no haya outline, según la documentación (https://developers.google.com/kml/documentation/kmlreference#style) 
        // es opcional indicar outline
        // Corregimos el bug 25306 No se carga el estilo de VV-del-Irati.kml
        //var outline = /** @type {boolean|undefined} */
        //    (styleObject['outline']);
        //if (outline !== undefined && !outline) {
        //    strokeStyle = null;
        //}

        var style = new ol.style.Style({
            fill: fillStyle,
            image: imageStyle,
            stroke: strokeStyle,
            text: textStyle,
            zIndex: undefined // FIXME
        });
        style._balloon = balloonStyle;
        return [style];
    };

    // flacunza: Parche para evitar peticiones HTTP desde una página HTTPS
    ol.format.KML._readURI_ = ol.format.KML.readURI_;
    ol.format.KML.readURI_ = function (node) {
        var result = ol.format.KML._readURI_(node);
        if (location.protocol === 'https:' && result.indexOf('http://') === 0) {
            result = result.substr(5);
        }
        return result;
    };
    for (var key in ol.format.KML.ICON_PARSERS_) {
        ol.format.KML.ICON_PARSERS_[key].href = ol.xml.makeObjectPropertySetter(ol.format.KML.readURI_);
    }

    // GLS: La expresión regular que valida el formato de fecha ISO no contempla que la fecha contenga fracción de segundo, según https://www.w3.org/TR/NOTE-datetime 
    ol.format.KML.whenParser_ = function (a, b) {
        ol.asserts.assert(a.nodeType == Node.ELEMENT_NODE, "node.nodeType should be ELEMENT");
        ol.asserts.assert("when" == a.localName, "localName should be when");
        var c = b[b.length - 1];
        ol.asserts.assert(goog.isObject(c), "gxTrackObject should be an Object");
        var c = c.whens
            , d = ol.xml.getAllTextContent(a, !1);
        if (d = /^\s*(\d{4})($|-(\d{2})($|-(\d{2})($|T(\d{2}):(\d{2}):(\d{2})(?:.?\d{3})?(Z|(?:([+\-])(\d{2})(?::(\d{2}))?)))))\s*$/.exec(d)) {
            var e = parseInt(d[1], 10)
                , f = d[3] ? parseInt(d[3],
                    10) - 1 : 0
                , g = d[5] ? parseInt(d[5], 10) : 1
                , h = d[7] ? parseInt(d[7], 10) : 0
                , k = d[8] ? parseInt(d[8], 10) : 0
                , l = d[9] ? parseInt(d[9], 10) : 0
                , e = Date.UTC(e, f, g, h, k, l);
            d[10] && "Z" != d[10] && (f = "-" == d[11] ? -1 : 1,
                e += 60 * f * parseInt(d[12], 10),
                d[13] && (e += 3600 * f * parseInt(d[13], 10)));
            c.push(e)
        } else
            c.push(0)
    };

    ol.format.KML.GX_TRACK_PARSERS_ = ol.xml.makeStructureNS(ol.format.KML.NAMESPACE_URIS_, {
        when: ol.format.KML.whenParser_
    }, ol.xml.makeStructureNS(ol.format.KML.GX_NAMESPACE_URIS_, {
        coord: ol.format.KML.gxCoordParser_
    }));

    var namespaceURISmanage = function (source, format) {
        var xml = ol.xml.parse(source);
        var tag = xml.getElementsByTagName(format.toLowerCase());
        if (tag && tag.length > 0) {
            var value = tag[0].getAttribute('xmlns');
            if (value && value.indexOf(' ') > -1 && customKMLNameSpaceURIS.indexOf(value) > -1) {
                var values = value.split(' ');
                var namespaces = [];
                for (var i = 0; i < values.length; i++) {
                    namespaces.push(('xmlns:' + format.toLowerCase() + i) + "=\"" + values[i].trim() + "\"");
                }
            }
        }

        return source;
    };

    // flacunza: Parcheo para poder leer KMLs generados por Google Earth. En ellos falta el atributo xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    // que se utiliza luego en xsi:schemaLocation, haciendo que el DOMParser no lea el elemento Placemark.
    ol.format.KML.prototype.readFeatures = function (source, opt_options) {
        if (typeof source === 'string') {
            var kmlTag = '<kml';
            var startIdx = source.indexOf(kmlTag);
            if (startIdx >= 0) {
                startIdx += kmlTag.length;
                var endIdx = source.indexOf('>', startIdx);
                if (source.indexOf('xmlns:xsi=') < 0) {
                    source = source.substr(0, startIdx) + ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"' + source.substr(startIdx);
                }

                source = namespaceURISmanage(source, 'KML');
            }
        }
        return ol.format.XMLFeature.prototype.readFeatures.call(this, source, opt_options);
    };

    // GLS: La expresión regular que valida el formato de fecha ISO no contempla que la fecha contenga fracción de segundo, según https://www.w3.org/TR/NOTE-datetime 
    ol.format.XSD.readDateTime = function (a) {
        a = ol.xml.getAllTextContent(a, !1);
        if (a = /^\s*(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(Z|(?:([+\-])(\d{2})(?::(\d{2}))?))\s*$/.exec(a)) {
            var b = parseInt(a[1], 10)
                , c = parseInt(a[2], 10) - 1
                , d = parseInt(a[3], 10)
                , e = parseInt(a[4], 10)
                , f = parseInt(a[5], 10)
                , g = parseInt(a[6], 10)
                , b = Date.UTC(b, c, d, e, f, g); // GLS quito el paso a segundos / 1E3
            "Z" != a[7] && (c = "-" == a[8] ? -1 : 1,
                b += 60 * c * parseInt(a[9], 10),
                void 0 !== a[10] && (b += 3600 * c * parseInt(a[10], 10)));
            return b
        };
    };

    ol.format.GPX.RTEPT_PARSERS_ = ol.xml.makeStructureNS(ol.format.GPX.NAMESPACE_URIS_, {
        ele: ol.xml.makeObjectPropertySetter(ol.format.XSD.readDecimal),
        time: ol.xml.makeObjectPropertySetter(ol.format.XSD.readDateTime)
    });
    ol.format.GPX.TRKPT_PARSERS_ = ol.xml.makeStructureNS(ol.format.GPX.NAMESPACE_URIS_, {
        ele: ol.xml.makeObjectPropertySetter(ol.format.XSD.readDecimal),
        time: ol.xml.makeObjectPropertySetter(ol.format.XSD.readDateTime)
    });
    ol.format.GPX.WPT_PARSERS_ = ol.xml.makeStructureNS(ol.format.GPX.NAMESPACE_URIS_, {
        ele: ol.xml.makeObjectPropertySetter(ol.format.XSD.readDecimal),
        time: ol.xml.makeObjectPropertySetter(ol.format.XSD.readDateTime),
        magvar: ol.xml.makeObjectPropertySetter(ol.format.XSD.readDecimal),
        geoidheight: ol.xml.makeObjectPropertySetter(ol.format.XSD.readDecimal),
        name: ol.xml.makeObjectPropertySetter(ol.format.XSD.readString),
        cmt: ol.xml.makeObjectPropertySetter(ol.format.XSD.readString),
        desc: ol.xml.makeObjectPropertySetter(ol.format.XSD.readString),
        src: ol.xml.makeObjectPropertySetter(ol.format.XSD.readString),
        link: ol.format.GPX.parseLink_,
        sym: ol.xml.makeObjectPropertySetter(ol.format.XSD.readString),
        type: ol.xml.makeObjectPropertySetter(ol.format.XSD.readString),
        fix: ol.xml.makeObjectPropertySetter(ol.format.XSD.readString),
        sat: ol.xml.makeObjectPropertySetter(ol.format.XSD.readNonNegativeInteger),
        hdop: ol.xml.makeObjectPropertySetter(ol.format.XSD.readDecimal),
        vdop: ol.xml.makeObjectPropertySetter(ol.format.XSD.readDecimal),
        pdop: ol.xml.makeObjectPropertySetter(ol.format.XSD.readDecimal),
        ageofdgpsdata: ol.xml.makeObjectPropertySetter(ol.format.XSD.readDecimal),
        dgpsid: ol.xml.makeObjectPropertySetter(ol.format.XSD.readNonNegativeInteger),
        extensions: ol.format.GPX.parseExtensions_
    });

    ol.format.XSD.writeDateTimeTextNode = function (node, dateTime) {
        var date = new Date(dateTime);
        var string = date.getUTCFullYear() + '-' +
            ol.string.padNumber(date.getUTCMonth() + 1, 2) + '-' +
            ol.string.padNumber(date.getUTCDate(), 2) + 'T' +
            ol.string.padNumber(date.getUTCHours(), 2) + ':' +
            ol.string.padNumber(date.getUTCMinutes(), 2) + ':' +
            ol.string.padNumber(date.getUTCSeconds(), 2) + 'Z';
        node.appendChild(ol.xml.DOCUMENT.createTextNode(string));
    };

    ol.format.GPX.WPT_TYPE_SERIALIZERS_ = ol.xml.makeStructureNS(
        ol.format.GPX.NAMESPACE_URIS_, {
            'ele': ol.xml.makeChildAppender(ol.format.XSD.writeDecimalTextNode),
            'time': ol.xml.makeChildAppender(ol.format.XSD.writeDateTimeTextNode),
            'magvar': ol.xml.makeChildAppender(ol.format.XSD.writeDecimalTextNode),
            'geoidheight': ol.xml.makeChildAppender(
                ol.format.XSD.writeDecimalTextNode),
            'name': ol.xml.makeChildAppender(ol.format.XSD.writeStringTextNode),
            'cmt': ol.xml.makeChildAppender(ol.format.XSD.writeStringTextNode),
            'desc': ol.xml.makeChildAppender(ol.format.XSD.writeStringTextNode),
            'src': ol.xml.makeChildAppender(ol.format.XSD.writeStringTextNode),
            'link': ol.xml.makeChildAppender(ol.format.GPX.writeLink_),
            'sym': ol.xml.makeChildAppender(ol.format.XSD.writeStringTextNode),
            'type': ol.xml.makeChildAppender(ol.format.XSD.writeStringTextNode),
            'fix': ol.xml.makeChildAppender(ol.format.XSD.writeStringTextNode),
            'sat': ol.xml.makeChildAppender(
                ol.format.XSD.writeNonNegativeIntegerTextNode),
            'hdop': ol.xml.makeChildAppender(ol.format.XSD.writeDecimalTextNode),
            'vdop': ol.xml.makeChildAppender(ol.format.XSD.writeDecimalTextNode),
            'pdop': ol.xml.makeChildAppender(ol.format.XSD.writeDecimalTextNode),
            'ageofdgpsdata': ol.xml.makeChildAppender(
                ol.format.XSD.writeDecimalTextNode),
            'dgpsid': ol.xml.makeChildAppender(
                ol.format.XSD.writeNonNegativeIntegerTextNode)
        });

    const hitTolerance = TC.Util.detectMouse() ? 3 : 10;

    // GLS: Obtenemos las combinaciones posibles
    var getAllCombinations = function (array) {
        var combi = [];
        var temp = [];

        var len = Math.pow(2, array.length);

        for (var i = 0; i < len; i++) {
            temp = [];
            for (var j = 0; j < array.length; j++) {
                if ((i & Math.pow(2, j))) {
                    if (temp.indexOf(array[j]) == -1)
                        temp.push(array[j]);
                }
            }
            if (temp.length > 0) {
                if (combi.indexOf(temp.join(' ')) == -1)
                    combi.push(temp.join(' '));
            }
        }

        return combi;
    }

    // GLS: Limpiamos de los nuevos los URIS ya disponibles en el formato
    var cleanCombinationsByFormat = function (customURIS, formatURIS) {
        if (customURIS && customURIS.length > 0) {
            for (var i = 0; i < formatURIS.length; i++) {
                var index = customURIS.indexOf(formatURIS[i]);
                if (index > -1)
                    customURIS.splice(index, 1);
            }
        }
    };

    // GLS: Establecemos los parser por formato para los nuevos URIS
    var setNewParsersByFormat = function (parsers, customURIS) {
        for (var i = 0; i < parsers.length; i++) {
            var parser = parsers[i];
            for (var j = 0; j < customURIS.length; j++) {
                var analogFormat = customURIS[j].split(' ')[0];
                parser[customURIS[j]] = parser[analogFormat];
            }
        }
    };

    var KML_PARSERS = [
        ol.format.KML.DATA_PARSERS_,
        ol.format.KML.EXTENDED_DATA_PARSERS_,
        ol.format.KML.REGION_PARSERS_,
        ol.format.KML.LAT_LON_ALT_BOX_PARSERS_,
        ol.format.KML.LOD_PARSERS_,
        ol.format.KML.EXTRUDE_AND_ALTITUDE_MODE_PARSERS_,
        ol.format.KML.FLAT_LINEAR_RING_PARSERS_,
        ol.format.KML.FLAT_LINEAR_RINGS_PARSERS_,
        ol.format.KML.GX_TRACK_PARSERS_,
        ol.format.KML.GEOMETRY_FLAT_COORDINATES_PARSERS_,
        ol.format.KML.ICON_PARSERS_,
        ol.format.KML.ICON_STYLE_PARSERS_,
        ol.format.KML.INNER_BOUNDARY_IS_PARSERS_,
        ol.format.KML.LABEL_STYLE_PARSERS_,
        ol.format.KML.LINE_STYLE_PARSERS_,
        ol.format.KML.MULTI_GEOMETRY_PARSERS_,
        ol.format.KML.GX_MULTITRACK_GEOMETRY_PARSERS_,
        ol.format.KML.NETWORK_LINK_PARSERS_,
        ol.format.KML.LINK_PARSERS_,
        ol.format.KML.OUTER_BOUNDARY_IS_PARSERS_,
        ol.format.KML.PAIR_PARSERS_,
        ol.format.KML.PLACEMARK_PARSERS_,
        ol.format.KML.POLY_STYLE_PARSERS_,
        ol.format.KML.SCHEMA_DATA_PARSERS_,
        ol.format.KML.STYLE_PARSERS_,
        ol.format.KML.STYLE_MAP_PARSERS_
    ];

    // GLS: Obtenemos los nuevos URIS para KML
    var customKMLNameSpaceURIS = getAllCombinations(ol.format.KML.NAMESPACE_URIS_.slice().slice(1));
    // GLS: Nos quedamos con las combinaciones nuevas
    cleanCombinationsByFormat(customKMLNameSpaceURIS, ol.format.KML.NAMESPACE_URIS_);
    // GLS: Añadimos los nuevos URIS al KML
    ol.format.KML.NAMESPACE_URIS_ = ol.format.KML.NAMESPACE_URIS_.concat(customKMLNameSpaceURIS);
    // GLS: Establecemos los parsers del KML para los nuevos URIS
    setNewParsersByFormat(KML_PARSERS, customKMLNameSpaceURIS);


    var GPX_PARSERS = [
        ol.format.GPX.GPX_PARSERS_,
        ol.format.GPX.LINK_PARSERS_,
        ol.format.GPX.RTE_PARSERS_,
        ol.format.GPX.RTEPT_PARSERS_,
        ol.format.GPX.TRK_PARSERS_,
        ol.format.GPX.TRKSEG_PARSERS_,
        ol.format.GPX.TRKPT_PARSERS_,
        ol.format.GPX.WPT_PARSERS_,
        ol.format.GPX.LINK_SERIALIZERS_,
        ol.format.GPX.RTE_SEQUENCE_,
        ol.format.GPX.RTE_SERIALIZERS_,
        ol.format.GPX.RTEPT_TYPE_SEQUENCE_,
        ol.format.GPX.TRK_SEQUENCE_,
        ol.format.GPX.TRK_SERIALIZERS_,
        ol.format.GPX.TRKSEG_SERIALIZERS_,
        ol.format.GPX.WPT_TYPE_SEQUENCE_,
        ol.format.GPX.WPT_TYPE_SERIALIZERS_,
        ol.format.GPX.GPX_SERIALIZERS_
    ];

    // GLS: Obtenemos los nuevos URIS para GPX
    var customGPXNameSpaceURIS = getAllCombinations(ol.format.GPX.NAMESPACE_URIS_.slice().slice(1));
    // GLS: Nos quedamos con las combinaciones nuevas
    cleanCombinationsByFormat(customGPXNameSpaceURIS, ol.format.GPX.NAMESPACE_URIS_);
    // GLS: Añadimos los nuevos URIS al GPX
    ol.format.GPX.NAMESPACE_URIS_ = ol.format.GPX.NAMESPACE_URIS_.concat(customGPXNameSpaceURIS);
    // GLS: Establecemos los parsers del GPX para los nuevos URIS
    setNewParsersByFormat(GPX_PARSERS, customGPXNameSpaceURIS);

    // Bug de OpenLayers hasta 4.1.0 como mínimo:
    // ol.format.GMLBase no lee varias features dentro de featureCollection, se queda solo con la última.
    // Esto es porque utiliza ol.xml.makeReplacer en vez de ol.xml.makeArrayPusher para leerlas.
    // Curiosamente en ol.format.GML2 está corregido, pero no en ol.format.GML3.
    // El siguiente constructor parchea ese bug
    ol.format.GML3Patched = function (options) {
        var result = new ol.format.GML(options);
        result.FEATURE_COLLECTION_PARSERS[ol.format.GMLBase.GMLNS][
            'featureMember'] =
            ol.xml.makeArrayPusher(ol.format.GMLBase.prototype.readFeaturesInternal);
        return result;
    };

    // Bug de OpenLayers hasta 3.5.0 como mínimo:
    // El parser de GML2 no lee las siguientes features del GML si tienen un featureType distinto del primero.
    // Esto pasa porque genera el objeto de featureTypes con la primera y en las siguientes iteraciones si el objeto existe no se regenera.
    // Entre comentarios /* */ se elimina lo que sobra.
    //
    // Más: se añade para FeatureCollection un parser por cada namespaceURI del nodo. 
    // Esto es porque QGIS genera GML cuyo nodo FeatureCollection tiene namespace = http://ogr.maptools.org/.
    ol.format.GMLBase.prototype.readFeaturesInternal = function (node, objectStack) {
        ol.DEBUG && console.assert(node.nodeType == Node.ELEMENT_NODE,
            'node.nodeType should be ELEMENT');
        var localName = node.localName;
        var features = null;
        if (localName == 'FeatureCollection') {
            // Ñapa para leer GML de https://catastro.navarra.es/ref_catastral/gml.ashx?C=217&PO=5&PA=626
            // y demás GMLs obtenidos de un WFS de GeoServer.
            var gmlnsCollectionParser = this.FEATURE_COLLECTION_PARSERS[ol.format.GMLBase.GMLNS];
            if (!gmlnsCollectionParser['member']) {
                gmlnsCollectionParser['member'] = ol.xml.makeArrayPusher(
                    ol.format.GMLBase.prototype.readFeaturesInternal);
            };
            //////
            if (node.namespaceURI === 'http://www.opengis.net/wfs') {
                features = ol.xml.pushParseAndPop([],
                    this.FEATURE_COLLECTION_PARSERS, node,
                    objectStack, this);
            } else {
                this.FEATURE_COLLECTION_PARSERS[node.namespaceURI] =
                    this.FEATURE_COLLECTION_PARSERS[node.namespaceURI] || this.FEATURE_COLLECTION_PARSERS[ol.format.GMLBase.GMLNS];
                features = ol.xml.pushParseAndPop(/*null*/[], // Cambiado null por [] porque si no, no crea el array de features
                    this.FEATURE_COLLECTION_PARSERS, node,
                    objectStack, this);
            }
        } else if (localName == 'featureMembers' || localName == 'featureMember' || localName == 'member') {
            var context = objectStack[0];
            var featureType = context['featureType'];
            var featureNS = context['featureNS'];
            var i, ii, prefix = 'p', defaultPrefix = 'p0';
            if (/*!featureType && */node.childNodes) {
                featureType = [], featureNS = {};
                for (i = 0, ii = node.childNodes.length; i < ii; ++i) {
                    var child = node.childNodes[i];
                    if (child.nodeType === 1) {
                        var ft = child.nodeName.split(':').pop();
                        if (featureType.indexOf(ft) === -1) {
                            var key = '';
                            var count = 0;
                            var uri = child.namespaceURI;
                            for (var candidate in featureNS) {
                                if (featureNS[candidate] === uri) {
                                    key = candidate;
                                    break;
                                }
                                ++count;
                            }
                            if (!key) {
                                key = prefix + count;
                                featureNS[key] = uri;
                            }
                            featureType.push(key + ':' + ft);
                        }
                    }
                }
                if (localName != 'featureMember' && localName != 'member') {
                    // recheck featureType for each featureMember
                    context['featureType'] = featureType;
                    context['featureNS'] = featureNS;
                }
            }
            if (typeof featureNS === 'string') {
                var ns = featureNS;
                featureNS = {};
                featureNS[defaultPrefix] = ns;
            }
            var parsersNS = {};
            var featureTypes = Array.isArray(featureType) ? featureType : [featureType];
            for (var p in featureNS) {
                var parsers = {};
                for (i = 0, ii = featureTypes.length; i < ii; ++i) {
                    var featurePrefix = featureTypes[i].indexOf(':') === -1 ?
                        defaultPrefix : featureTypes[i].split(':')[0];
                    if (featurePrefix === p) {
                        parsers[featureTypes[i].split(':').pop()] =
                            (localName == 'featureMembers') ?
                                ol.xml.makeArrayPusher(this.readFeatureElement, this) :
                                ol.xml.makeReplacer(this.readFeatureElement, this);
                    }
                }
                parsersNS[featureNS[p]] = parsers;
            }
            if (localName == 'featureMember' || localName == 'member') { // Elemento solo
                features = ol.xml.pushParseAndPop(undefined, parsersNS, node, objectStack);
            } else { // Colección de elementos
                features = ol.xml.pushParseAndPop([], parsersNS, node, objectStack);
            }
        }
        if (features === null) {
            features = [];
        }
        // Revisamos que todas las features tienen geometría válida o no tienen geometría definida. Evitamos así que cuele un GML 2 parseado con el parser GML 3.
        var checkFeatureGeometry = function (feat) {
            var geom = feat.getGeometry();
            if (feat.getProperties().hasOwnProperty(feat.getGeometryName()) && (!geom || !geom.flatCoordinates.length)) {
                throw 'Geometría no válida. ¿Posible versión incorrecta de GML?';
            }
        };
        if (features instanceof ol.Feature) {
            checkFeatureGeometry(features);
        }
        else {
            for (var i = 0, len = features.length; i < len; i++) {
                checkFeatureGeometry(features[i]);
            }
        }
        return features;
    };

    ol.format.GML3CRS84 = function () {
        ol.format.GML3.call(this, {
            srsName: 'CRS:84'
        });
    };
    ol.inherits(ol.format.GML3CRS84, ol.format.GML3);

    ol.format.GML2CRS84 = function () {
        ol.format.GML2.call(this, {
            srsName: 'CRS:84'
        });
    };
    ol.inherits(ol.format.GML2CRS84, ol.format.GML2);

    // Parche para evitar el error AssertionError: Assertion failed: calculated value (1.020636810790192) ouside allowed range (0-1)
    ol.View.prototype.getValueForResolutionFunction = function (opt_power) {
        var power = opt_power || 2;
        var maxResolution = this.maxResolution_;
        var minResolution = this.minResolution_;
        var max = Math.log(maxResolution / minResolution) / Math.log(power);
        return (
            /**
                 * @param {number} resolution Resolution.
                 * @return {number} Value.
             */
            function (resolution) {
                var value =
                    (Math.log(maxResolution / resolution) / Math.log(power)) / max;
                value = Math.max(Math.min(1, value), 0);
                return value;
            });
    };

    // Modificación para cambiar el comportamiento de ol.control.OverviewMap:
    // Mantener la caja del extent siempre centrada.
    ol.control.OverviewMap.prototype._validateExtent_ = ol.control.OverviewMap.prototype.validateExtent_;
    ol.control.OverviewMap.prototype.validateExtent_ = function () {
        var self = this;
        self._validateExtent_();
        if (self._wrap && self._wrap.parent.options.alwaysCentered) {
            self.recenter_();
        }
    };

    // En modo 3D, cambiar la lógica de la escala para que siempre muestre área de visión.
    ol.control.OverviewMap.prototype._resetExtent_ = ol.control.OverviewMap.prototype.resetExtent_;
    ol.control.OverviewMap.prototype.resetExtent_ = function () {
        var self = this;
        self._resetExtent_.call(self);
        var wrap = self._wrap;
        if (wrap.is3D) {
            var ovmap = self.ovmap_;
            var ovview = ovmap.getView();
            var extent = ovview.calculateExtent();
            var feature = wrap.get3DCameraLayer().getSource().getFeatures()[0];
            if (feature) {
                coordinates = feature.getGeometry().getCoordinates();
                var coord1 = coordinates[0][0];
                var coord2 = coordinates[0][1];
                if (!ol.extent.containsCoordinate(extent, coord1) || !ol.extent.containsCoordinate(extent, coord2)) {
                    var buffer = Math.max(
                        extent[0] - coord1[0],
                        extent[1] - coord1[1],
                        coord1[0] - extent[2],
                        coord1[1] - extent[3],
                        extent[0] - coord2[0],
                        extent[1] - coord2[1],
                        coord2[0] - extent[2],
                        coord2[1] - extent[3]
                    );
                    ovview.fit(ol.extent.buffer(extent, buffer));
                }
            }
        }
    };

    // Parche a mantener hasta que se actualize cartoteca
    const oldImage = ol.Image;
    ol.Image = function () {
        if (arguments.length === 7) {
            Array.prototype.splice.call(arguments, 3, 1);
        }
        return oldImage.apply(this, arguments);
    }
    TC.inherit(ol.Image, oldImage);

    if (!TC.Util.detectMobile()) {
        // Parche para situar el ancla del popup cuando tenemos zoom in/out de navegador o pantalla
        ol.Overlay.prototype.updateRenderedPosition = function (pixel, mapSize) {
            var style = this.element.style;
            var offset = this.getOffset();

            var positioning = this.getPositioning();

            this.setVisible(true);

            var offsetX = offset[0];
            var offsetY = offset[1];
            if (positioning == ol.OverlayPositioning.BOTTOM_RIGHT ||
                positioning == ol.OverlayPositioning.CENTER_RIGHT ||
                positioning == ol.OverlayPositioning.TOP_RIGHT) {
                if (this.rendered.left_ !== '') {
                    this.rendered.left_ = style.left = '';
                }
                var right = Math.round(mapSize[0] - pixel[0] - offsetX) / window.devicePixelRatio + 'px';
                if (this.rendered.right_ != right) {
                    this.rendered.right_ = style.right = right;
                }
            } else {
                if (this.rendered.right_ !== '') {
                    this.rendered.right_ = style.right = '';
                }
                if (positioning == ol.OverlayPositioning.BOTTOM_CENTER ||
                    positioning == ol.OverlayPositioning.CENTER_CENTER ||
                    positioning == ol.OverlayPositioning.TOP_CENTER) {
                    offsetX -= this.element.offsetWidth / 2;
                }
                var left = Math.round(pixel[0] + offsetX) / window.devicePixelRatio + 'px';
                if (this.rendered.left_ != left) {
                    this.rendered.left_ = style.left = left;
                }
            }
            if (positioning == ol.OverlayPositioning.BOTTOM_LEFT ||
                positioning == ol.OverlayPositioning.BOTTOM_CENTER ||
                positioning == ol.OverlayPositioning.BOTTOM_RIGHT) {
                if (this.rendered.top_ !== '') {
                    this.rendered.top_ = style.top = '';
                }
                var bottom = Math.round(mapSize[1] - pixel[1] - offsetY) / window.devicePixelRatio + 'px';
                if (this.rendered.bottom_ != bottom) {
                    this.rendered.bottom_ = style.bottom = bottom;
                }
            } else {
                if (this.rendered.bottom_ !== '') {
                    this.rendered.bottom_ = style.bottom = '';
                }
                if (positioning == ol.OverlayPositioning.CENTER_LEFT ||
                    positioning == ol.OverlayPositioning.CENTER_CENTER ||
                    positioning == ol.OverlayPositioning.CENTER_RIGHT) {
                    offsetY -= this.element.offsetHeight / 2;
                }
                var top = Math.round(pixel[1] + offsetY) / window.devicePixelRatio + 'px';
                if (this.rendered.top_ != top) {
                    this.rendered.top_ = style.top = top;
                }
            }
        };
    }

    /////////////////////////////////////////////////////

    var getRGBA = function (color, opacity) {
        var result;
        if (color) {
            result = ol.color.asArray(color);
            result = result.slice();
            if (opacity !== undefined) {
                result[3] = opacity;
            }
        }
        else {
            result = [0, 0, 0, 1];
        }
        return result;
    };

    /**
     * Obtiene el objeto de opciones de una vista que restringe los niveles de zoom activos sobre el mapa dependiendo de las opciones definidas sobre
     * el mapa base activo.
     */
    var getResolutionOptions = function (mapWrap, layer) {
        var view = mapWrap.map.getView();
        var prevRes = view.getResolution();

        var pms = {
            projection: view.getProjection(),
            center: view.getCenter(),
            resolution: prevRes,
            enableRotation: false
        };

        if (mapWrap.parent.maxExtent) {
            pms.extent = mapWrap.parent.maxExtent;
        }

        // GLS 06/03/2019 Corregimos bug 24832, si el mapa de fondo es el mapa en blanco, asignamos las resoluciones del mapa de fondo actual
        var layerForResolutions = layer;
        if (layer.type === TC.Consts.layerType.VECTOR && mapWrap.parent.getBaseLayer()) {
            layerForResolutions = mapWrap.parent.getBaseLayer();
        }

        var res = layerForResolutions.getResolutions ? layerForResolutions.getResolutions() : [];
        var maxRes;
        var minRes;

        if (res && res.length) {
            maxRes = layerForResolutions.maxResolution || res[0];
            minRes = layerForResolutions.minResolution || res[res.length - 1];

            var minResIx = res.indexOf(minRes);
            var maxResIx = res.indexOf(maxRes);

            pms.resolutions = res.slice(maxResIx, minResIx + 1);
        }
        else {
            maxRes = layerForResolutions.maxResolution;
            minRes = layerForResolutions.minResolution;
        }
        if (minRes) {
            pms.minResolution = minRes;
            if (prevRes < minRes) {
                pms.resolution = minRes;
            }
        }
        if (maxRes) {
            pms.maxResolution = maxRes;
            if (prevRes > maxRes) {
                pms.resolution = maxRes;
            }
        }

        return pms;
    };


    TC.wrap.Map.prototype.setMap = function () {
        var self = this;
        var center = [
            (self.parent.initialExtent[0] + self.parent.initialExtent[2]) / 2,
            (self.parent.initialExtent[1] + self.parent.initialExtent[3]) / 2
        ];

        var proj4Obj = proj4(self.parent.crs);
        var addEquivalentProjections = function () {
            // Añadimos proyecciones equivalentes y transformaciones necesarias.
            var crsCode = self.parent.crs.substr(self.parent.crs.lastIndexOf(':') + 1);

            var projOptions = {
                units: proj4Obj.oProj.units,
                global: true
            };

            var equivalentProjections = [];
            if (crsCode !== '4326') { // Este código ya está metido, no lo machacamos
                projOptions.code = 'EPSG:' + crsCode;
                equivalentProjections.push(new ol.proj.Projection(projOptions));
                projOptions.code = 'urn:ogc:def:crs:EPSG::' + crsCode;
                equivalentProjections.push(new ol.proj.Projection(projOptions));

                ol.proj.addEquivalentProjections(equivalentProjections);
            }
            var doTransform = function (fn, input, opt_output, opt_dimension) {
                var result = [];
                var dimension = opt_dimension || 2;
                for (var i = 0; i < input.length; i += dimension) {
                    var transformed = Array.prototype.slice.call(fn(input.slice(i, i + dimension)));
                    if (dimension === 3 || dimension === 4) {
                        transformed = transformed.slice(0, 2).concat(input.slice(i + 2, (i + 2) + (dimension - 2)));
                    }

                    result = result.concat(transformed);
                }
                if ($.isArray(opt_output)) {
                    opt_output.length = 0;
                    for (var i = 0; i < result.length; i++) {
                        opt_output[i] = result[i];
                    }
                    result = opt_output;
                }
                return result;
            };
            var fromEPSG4326 = function (input, opt_output, opt_dimension) {
                return doTransform(proj4Obj.forward, input, opt_output, opt_dimension);
            };
            var toEPSG4326 = function (input, opt_output, opt_dimension) {
                return doTransform(proj4Obj.inverse, input, opt_output, opt_dimension);
            };

            ol.proj.addEquivalentTransforms(
                ol.proj.EPSG4326.PROJECTIONS,
                equivalentProjections,
                fromEPSG4326,
                toEPSG4326);
        };

        addEquivalentProjections();

        var projOptions = {
            code: self.parent.crs,
            units: proj4Obj.oProj.units
        };
        if (self.parent.crs === 'EPSG:4326') {
            projOptions.axisOrientation = 'neu';
        }
        var projection = new ol.proj.Projection(projOptions);

        var interactions = ol.interaction.defaults({ constrainResolution: true });

        var viewOptions = {
            projection: projection,
            center: center,
            enableRotation: false
        };
        if (self.parent.maxExtent) {
            var maxExtent = self.parent.maxExtent;
            viewOptions.extent = maxExtent;
            var rect = self.parent.div.getBoundingClientRect();
            var ratio = rect.width / rect.height;
            var dx = maxExtent[2] - maxExtent[0];
            var dy = maxExtent[3] - maxExtent[1];
            if (rect.width / rect.height > dx / dy) {
                viewOptions.resolution = dx / rect.width;
            }
            else {
                viewOptions.resolution = dy / rect.height;
            }
        }
        else {
            viewOptions.zoom = 2;
        }

        self.map = new ol.Map({
            target: self.parent.div,
            renderer: ol.renderer.Type.CANVAS,
            view: new ol.View(viewOptions),
            controls: [],
            interactions: interactions,
            pixelRatio: 1 /* 08/02/2019 GLS: 
            Establecemos el pixelRatio siempre a uno, porque OL sólo atiende al valor al principio, 
            si después se hace zoom in/out del navegador, OL no atiende el cambio lo que provoca que el mapa se vea borroso,
            click se sitúa mal, popup se sitúa entre otros efectos.
            Lo gestionamos nosotros hasta que lo soporten del todo. Relacionado con las tareas/bugs:
                Bug 25976:Mapa situación en blanco
                Bug 25954:Canvas en blanco con zoom mayor al 100%
                Bug 23855:Mapa de situación se muestra en blanco
            */
        });

        if (!TC.Util.detectMobile()) {
            // Parche para corregir https://github.com/openlayers/openlayers/issues/2904
            // saben que tienen un bug cuando se trabaja sobre un mapa con zoom
            self.map.getEventPixel = function (event) {
                var viewportPosition = this.viewport_.getBoundingClientRect();
                var eventPosition = event.changedTouches ? event.changedTouches[0] : event;
                eventPosition = eventPosition.clientX ? eventPosition : (eventPosition.pointerEvent ? eventPosition.pointerEvent : eventPosition);
                return [
                    (eventPosition.clientX - viewportPosition.left) * window.devicePixelRatio,
                    (eventPosition.clientY - viewportPosition.top) * window.devicePixelRatio
                ];
            };
        }

        self.map._wrap = self;
        self._promise = Promise.resolve(self.map);

        // mantenemos el ancho y alto del canvas en números enteros
        self.manageSize.call(self.map);

        // Para evitar estiramientos en canvas
        var updateSize = function () {
            self.map.updateSize();
        };
        self.parent.div.addEventListener(ol.events.EventType.RESIZE, updateSize);
        self.parent.one(TC.Consts.event.MAPLOAD, updateSize);

        self.map.on(ol.MapBrowserEventType.SINGLECLICK, function (e) {

            if (self.parent.view === TC.Consts.view.PRINTING) {
                return;
            }

            self.parent.workLayers.forEach(function (wl) {
                delete wl._noFeatureClicked;
            });
            var featuresInLayers = $.map(self.parent.workLayers, function () {
                return false;
            });
            self.map.forEachFeatureAtPixel(e.pixel,
                function (feature, layer) {
                    if (feature._wrap && feature._wrap.parent.showsPopup) {
                        for (var i = 0; i < self.parent.workLayers.length; i++) {
                            var wl = self.parent.workLayers[i];
                            if (wl.wrap.layer === layer) {
                                featuresInLayers[i] = true;
                                break;
                            }
                        }
                        self.parent.trigger(TC.Consts.event.FEATURECLICK, { feature: feature._wrap.parent });
                        return feature;
                    }
                },
                {
                    hitTolerance: hitTolerance
                });
            for (var i = 0; i < featuresInLayers.length; i++) {
                if (!featuresInLayers[i]) {
                    self.parent.trigger(TC.Consts.event.NOFEATURECLICK, { layer: self.parent.workLayers[i] });
                }
            }
        });


        // GLS: 13/02/2019 cambiamos el orden de las suscripciones a eventos de cambio de resolución y moveend
        // para gestionar el borrado del estado inicial. Si no lo hacemos el cambio al extent inicial se registra como evento de usuario
        // porque la carga inicial del mapa con promesas nativas es más rápido que antes.
        // Bug:26001 Borrar estado inicial al entrar
        const addMoveEndListener = function () {
            self.map.on(ol.MapEventType.MOVEEND, function () {
                self.parent.trigger(TC.Consts.event.ZOOM);
            });
        };
        var olView = self.map.getView();
        olView.on('change:resolution', function () {
            if (!self.map.hasListener(ol.MapEventType.MOVEEND)) {
                self.map.once(ol.MapEventType.MOVEEND, function () {
                    addMoveEndListener();
                });
            }

            self.parent.trigger(TC.Consts.event.BEFOREZOOM);
        }, self.parent);

        const onChangeView = function () {
            if (!self.map.hasListener(ol.MapEventType.MOVEEND)) {
                self.map.un('change:view', onChangeView);
                addMoveEndListener();
            }
        };
        self.map.on('change:view', onChangeView);

        /**
         * Restringe los niveles de zoom activos sobre el mapa dependiendo de las opciones definidas sobre
         * el mapa base activo.
         */
        var limitZoomLevels = function (layer) {
            var prevRes = self.map.getView().getResolution();
            var prevZoom = self.map.getView().getZoom();

            var pms = getResolutionOptions(self, layer);

            var view = new ol.View(pms);
            self.map.setView(view);
            self.map.render();
        };

        self.parent.on(TC.Consts.event.BASELAYERCHANGE, function (e) {
            // Solo se limitan las resoluciones cuando estamos en un CRS por defecto, donde no se repixelan teselas
            if (self.parent.crs === self.parent.options.crs && !self.parent.on3DView && e.layer.type !== TC.Consts.layerType.VECTOR) {
                limitZoomLevels(e.layer);
            }
        });
        self.parent.on(TC.Consts.event.MAPLOAD, function (e) {
            limitZoomLevels(self.parent.getBaseLayer());
        });

        const olMapViewport = self.map.getViewport();

        olMapViewport.addEventListener(TC.Consts.event.MOUSEMOVE, function (e) {
            var mapTarget = self.map.getTarget();
            var hit = false;
            var feature;

            if (!self.parent.activeControl || !self.parent.activeControl.isExclusive()) {

                if (self.parent.view === TC.Consts.view.PRINTING) {
                    return;
                }

                var pixel = self.map.getEventPixel(e);
                hit = self.map.forEachFeatureAtPixel(pixel, function (feature, layer) {
                    var result = true;
                    if (feature._wrap && !feature._wrap.parent.showsPopup && !feature._wrap.parent.options.selectable) {
                        result = false;
                    }

                    if (result && feature._wrap) {
                        self.parent.trigger(TC.Consts.event.FEATUREOVER, {
                            feature: feature._wrap.parent
                        });
                    }

                    return result;
                }, { hitTolerance: hitTolerance });
            }

            if (hit) {
                mapTarget.style.cursor = 'pointer';
            } else {
                mapTarget.style.cursor = '';
                //self.parent.trigger(TC.Consts.event.FEATUREOUT);
            }
        });
    };

    var getMetersPerUnit = function (proj, extentInDegrees) {
        var units = proj.getUnits();
        if (!units || units === ol.proj.Units.DEGREES) {
            return TC.Util.getMetersPerDegree(extentInDegrees);
        }
        return ol.proj.METERS_PER_UNIT[units];
    };

    TC.wrap.Map.prototype.getMetersPerUnit = function () {
        var self = this;
        return getMetersPerUnit(ol.proj.get(self.parent.crs), self.getExtent());
    };

    var getUnitRatio = function (options) {
        var self = this;
        options = options || {};
        var defaultCrs = self.parent.options.crs || TC.Cfg.crs;
        var defaultProj = ol.proj.get(defaultCrs);
        var newProj = ol.proj.get(options.crs);
        return getMetersPerUnit(newProj, options.extentInDegrees) / getMetersPerUnit(defaultProj, options.extentInDegrees);
    };

    var normalizeProjection = function (options) {
        var result;
        if (options.axisOrientation) {
            result = new ol.proj.Projection({
                code: options.crs,
                axisOrientation: options.axisOrientation
            });
        }
        else {
            result = ol.proj.get(options.crs);
        }
        if (!result.getUnits()) {
            result.units_ = ol.proj.Units.DEGREES;
        }
        return result;
    };

    TC.wrap.Map.prototype.setProjection = function (options) {
        const self = this;
        options = options || {};
        const baseLayer = options.baseLayer || self.parent.baseLayer;
        var extent;
        if (options.extent) {
            extent = options.extent;
        }
        else {
            extent = ol.proj.transformExtent(self.getExtent(), self.parent.crs, options.crs);
        }
        const extentInDegrees = ol.proj.transformExtent(extent, options.crs, 'EPSG:4326');
        const unitRatio = getUnitRatio.call(self, {
            crs: options.crs,
            extentInDegrees: extentInDegrees
        });
        const projection = normalizeProjection(options);
        const oldView = self.map.getView();
        const viewOptions = {
            projection: projection,
            enableRotation: false
        };
        const resolutions = baseLayer.getResolutions();

        if (resolutions && resolutions.length) {
            viewOptions.resolutions = resolutions;
        }
        else {
            viewOptions.minZoom = oldView.getMinZoom();
            viewOptions.maxZoom = oldView.getMaxZoom();
            const minResolution = baseLayer.wrap.layer.getMinResolution();
            const maxResolution = baseLayer.wrap.layer.getMaxResolution();
            var transformFactor = 1;
            if (minResolution === 0 || maxResolution === Number.POSITIVE_INFINITY) {
                const oldUnitRatio = getUnitRatio.call(self, {
                    crs: self.parent.crs,
                    extentInDegrees: extentInDegrees
                });
                transformFactor = oldUnitRatio / unitRatio;
            }
            if (minResolution === 0) {
                viewOptions.minResolution = oldView.getMinResolution() * transformFactor;
            }
            else {
                viewOptions.minResolution = minResolution;
            }
            if (maxResolution === Number.POSITIVE_INFINITY) {
                viewOptions.maxResolution = oldView.getMaxResolution() * transformFactor;
            }
            else {
                viewOptions.maxResolution = maxResolution;
            }
        }

        // GLS: transformamos también el centro     
        viewOptions.center = ol.proj.transform(self.getCenter(), self.parent.crs, options.crs);

        var newView = new ol.View(viewOptions);
        self.map.setView(newView);
        self.parent.initialExtent = unitRatio !== 1 ? ol.proj.transformExtent(self.parent.initialExtent, self.parent.crs, options.crs) : self.parent.options.initialExtent;        
        if (self.parent.options.maxExtent) {            
            self.parent.options.maxExtent = self.parent.maxExtent = unitRatio !== 1 ? ol.proj.transformExtent(self.parent.maxExtent, self.parent.crs, options.crs) : self.parent.options.maxExtent;
        }
        newView.fit(extent, { nearest: true });
    };

    /*
     *  insertLayer: inserts OpenLayers layer at index
     *  Parameters: OpenLayers.Layer, number
     */
    TC.wrap.Map.prototype.insertLayer = function (olLayer, idx) {
        var self = this;
        var layers = self.map.getLayers();
        var alreadyExists = false;
        for (var i = 0; i < layers.getLength(); i++) {
            if (layers.item(i) === olLayer) {
                alreadyExists = true;
                break;
            }
        }
        if (alreadyExists) {
            layers.remove(olLayer);
            layers.insertAt(idx, olLayer);
        }
        else {
            if (idx < 0) {
                layers.push(olLayer);
            }
            else {
                layers.insertAt(idx, olLayer);
            }
            // Solo se limitan las resoluciones cuando estamos en un CRS por defecto, donde no se repixelan teselas
            var view = self.map.getView();
            if (self.parent.crs === self.parent.options.crs) {
                if (olLayer instanceof ol.layer.Tile) {
                    var resolutions = olLayer.getSource().getResolutions();
                    view.maxResolution_ = resolutions[0];
                    view.minResolution_ = resolutions[resolutions.length - 1];
                }
            }
            else {
                // Cambiamos los límites de resolución de la capa a los de la vista. Esto lo hacemos porque su resolución está en otro CRS.
                if (olLayer instanceof ol.layer.Tile) {
                    olLayer.setMaxResolution(view.getMaxResolution());
                    olLayer.setMinResolution(view.getMinResolution());
                }
            }

            var wrap = olLayer._wrap;
            var loadingTileCount = 0;

            var beforeTileLoadHandler = function (e) {
                wrap.parent.state = TC.Layer.state.LOADING;
                if (loadingTileCount <= 0) {
                    loadingTileCount = 0;
                    self.parent.trigger(TC.Consts.event.BEFORELAYERUPDATE, { layer: wrap.parent });
                }
                olLayer._loadingTileCount = olLayer._loadingTileCount + 1;
            };
            if (wrap.parent.state === TC.Layer.state.LOADING && wrap.parent.isRaster()) {
                beforeTileLoadHandler();
            }
            wrap.$events.on(TC.Consts.event.BEFORETILELOAD, beforeTileLoadHandler);

            wrap.$events.on(TC.Consts.event.TILELOAD, function (e) {
                loadingTileCount = loadingTileCount - 1;
                if (loadingTileCount <= 0) {
                    loadingTileCount = 0;
                    wrap.parent.state = TC.Layer.state.IDLE;
                    self.parent.trigger(TC.Consts.event.LAYERUPDATE, { layer: wrap.parent });
                }
            });
        }
    };

    TC.wrap.Map.prototype.removeLayer = function (olLayer) {
        this.map.removeLayer(olLayer);
    };

    TC.wrap.Map.prototype.getLayerCount = function () {
        return this.map.getLayerGroup().getLayers().getLength();
    };

    TC.wrap.Map.prototype.indexOfFirstVector = function () {
        var result = -1;
        this.map.getLayerGroup().getLayers().forEach(function (l, i) {
            if (l instanceof ol.layer.Vector && result === -1) {
                result = i;
            }
        });
        return result;
    };

    TC.wrap.Map.prototype.getLayerIndex = function (olLayer) {
        var result = -1;
        this.map.getLayerGroup().getLayers().forEach(function (elm, idx) {
            if (elm === olLayer) {
                result = idx;
            }
        });
        return result;
    };

    TC.wrap.Map.prototype.setLayerIndex = function (olLayer, index) {
        var layers = this.map.getLayers();
        var list = layers.getArray();
        var ix = list.indexOf(olLayer);

        if (ix > -1 && ix != index) {
            this.map.removeLayer(olLayer);
            this.insertLayer(olLayer, index);
            //layers.setAt(index, olLayer);
        }
        else {
            //no está el layer, así que no hago nada
        }

    };

    TC.wrap.Map.prototype.setBaseLayer = function (olLayer) {
        var self = this;
        return new Promise(function (resolve, reject) {
            var setLayer = function (curBl) {
                // GLS: si se llega después de una animación el valor de self.parent.getBaseLayer() ya es el definitivo y no el actual lo que provoca efectos indeseados. 
                // ir a línea 1313: paso como parámetro el baseLayer actual en el caso de animación.
                var curBl = curBl || self.parent.getBaseLayer();
                if (curBl) {
                    self.map.removeLayer(curBl.wrap.layer);
                    if (olLayer instanceof ol.layer.Image) { // Si es imagen no teselada
                        var unitRatio = getUnitRatio.call(self, {
                            crs: self.parent.crs,
                            extent: self.parent.getExtent()
                        });
                        olLayer._wrap.setProjection({
                            crs: self.parent.crs
                        });
                    }

                    if (olLayer._wrap.parent.type === TC.Consts.layerType.WMTS) {
                        var layerProjectionOptions = { crs: self.parent.crs, oldCrs: olLayer.getSource().getProjection().getCode() };

                        if (layerProjectionOptions.oldCrs !== layerProjectionOptions.crs) {
                            olLayer._wrap.parent.setProjection(layerProjectionOptions);
                        }
                    }

                    //if (olLayer instanceof ol.layer.Tile) { // Si es imagen teselada
                    //    const view = self.map.getView();
                    //    const resolutions = olLayer.getSource().getResolutions();
                    //    if (resolutions) {
                    //        view.options_.resolutions = resolutions;
                    //        view.applyOptions_(view.options_);
                    //    }
                    //}
                }
                self.insertLayer(olLayer, 0);
                resolve();
            };

            // Toda esta lógica antes de llamar a setLayer() es para hacer un zoom a la nueva resolución
            // cuando la nueva capa no llega a la resolución actual
            var viewOptions = getResolutionOptions(self, olLayer._wrap.parent);
            var view = self.map.getView();
            var currentResolution = view.getResolution();
            // Solo se limitan las resoluciones cuando estamos en un CRS por defecto, donde no se repixelan teselas
            if (self.parent.crs === self.parent.options.crs && viewOptions.resolutions) {
                //buscamos la nueva resolución: o una que sea similar a la actual dentro de los márgenes admitidos, o la inmediata superior
                var newRes = viewOptions.resolutions
                    .sort(function (a, b) { return a - b })
                    .reduce(function (prev, elm) {
                        if (prev === 0 &&
                            (elm > currentResolution || Math.abs(1 - (currentResolution / elm)) < self.parent.options.maxResolutionError)) {
                            return elm;
                        }
                        return prev;
                    }, 0);
                if (newRes !== currentResolution) {
                    if (self.parent.isLoaded) {
                        view.animate({ resolution: newRes, duration: TC.Consts.ZOOM_ANIMATION_DURATION }, setLayer.bind(self, self.parent.getBaseLayer()));
                    }
                    else { // Primera carga, no animamos
                        view.setResolution(newRes);
                        setLayer();
                    }
                }
                else {
                    setLayer();
                }
            }
            else {
                setLayer();
            }
        });
    };

    TC.wrap.Map.prototype.setExtent = function (extent, options) {
        const self = this;
        options = options || {};

        const applyExtent = function (view, mapSize, resolve, reject) {
            var res = view.getResolutionForExtent(extent, mapSize);
            // URI: Esta logica está fusilada de la función fit de un objeto view de OL3
            if (view.constrainResolution) {
                var constrainedResolution = view.constrainResolution(res, 0, 0);
                if (constrainedResolution < res) {
                    if (constrainedResolution / res < TC.Consts.EXTENT_TOLERANCE) {
                        constrainedResolution = view.constrainResolution(
                            constrainedResolution, -1, 0);
                    }
                }
                res = constrainedResolution;
            }

            // flacunza: No animamos si la duración va a ser 0, porque a veces el zoom no se completa
            // GLS: antes de resolver la promesa validamos si existe animación
            // URI: si la animacion no existe ponemos duracion 0
            // flacunza: en caso de que animate=undefined, se anima
            const center = [((extent[0] + extent[2]) / 2), ((extent[1] + extent[3]) / 2)];
            if (options.animate === void (0) || options.animate) {
                view.animate({
                    resolution: res,
                    center: center,
                    duration: TC.Consts.ZOOM_ANIMATION_DURATION
                }, resolve);
            }
            else {
                view.setCenter(center);
                view.setResolution(res);
                resolve();
            }
        };

        const setPromise = function (extent, options) {
            self._setExtentPromise = new Promise(function (resolve, reject) {
                // Timeout porque OL3 no tiene evento featuresadded, por tanto cuando se activa map.options.zoomToMarkers
                // se lanza un setExtent por marcador. El timeout evita ejecuciones a lo tonto.
                clearTimeout(self._timeout);
                self._timeout = setTimeout(function () {
                    var mapSize = self.map.getSize();
                    var view = self.map.getView();

                    if (self.parent.baseLayer) {
                        self.parent.baseLayer.wrap.getLayer().then(function (olLayer) {
                            // Todo esto para evitar que haga más zoom que el admisible por la capa base
                            var olSource = olLayer.getSource();
                            if (olSource.getResolutions != goog.abstractMethod) {
                                var res = view.getResolutionForExtent(extent, mapSize);
                                var resolutions = self.map.getView().getResolutions();

                                if (resolutions && resolutions.length > 0) {
                                    var minRes = Math.min.apply(self, resolutions);
                                    if (minRes > res) {
                                        var factor = 0.5 * (minRes / res - 1);
                                        var dx = ol.extent.getWidth(extent) * factor;
                                        var dy = ol.extent.getHeight(extent) * factor;
                                        extent = extent.slice(0);
                                        extent[0] = extent[0] - dx;
                                        extent[1] = extent[1] - dy;
                                        extent[2] = extent[2] + dx;
                                        extent[3] = extent[3] + dy;
                                    }
                                }
                            }

                            applyExtent(view, mapSize, resolve, reject);

                        });
                    }
                    else {
                        applyExtent(view, mapSize, resolve, reject);
                    }
                }, 50);
            });
        };
        Promise.resolve(self._setExtentPromise).finally(function () {
            setPromise(extent, options);
        });

        return self._setExtentPromise;
    };

    TC.wrap.Map.prototype.getExtent = function () {
        return this.map.getView().calculateExtent(this.map.getSize());
    };

    TC.wrap.Map.prototype.setCenter = function (coords, options) {
        const self = this;
        return new Promise(function (resolve, reject) {
            const callback = function () {
                resolve();
            };

            const opts = options || {};
            const view = self.map.getView();

            if (opts.animate) {
                view.animate({
                    center: coords, duration: TC.Consts.ZOOM_ANIMATION_DURATION
                }, callback);
            }
            else {
                view.setCenter(coords);
                resolve();
            }
        });
    };

    TC.wrap.Map.prototype.getCenter = function () {
        return this.map.getView().getCenter();
    };

    TC.wrap.Map.prototype.getResolution = function () {
        return this.map.getView().getResolution();
    };

    TC.wrap.Map.prototype.setResolution = function (resolution) {
        this.getMap().then(function (olMap) {
            olMap.getView().setResolution(resolution);
        });
    };

    TC.wrap.Map.prototype.setRotation = function (rotation) {
        this.getMap().then(function (olMap) {
            olMap.getView().setRotation(rotation);
        });
    };

    TC.wrap.Map.prototype.getRotation = function () {
        return this.map.getView().getRotation();
    };

    TC.wrap.Map.prototype.getResolutions = function () {
        return this.map.getView().getResolutions() || [];
    };

    TC.wrap.Map.prototype.getCoordinateFromPixel = function (xy) {
        return this.map.getCoordinateFromPixel(xy);
    };

    TC.wrap.Map.prototype.getPixelFromCoordinate = function (coord) {
        return this.map.getPixelFromCoordinate(coord);
    };

    TC.wrap.Map.prototype.getViewport = function (options) {
        const self = this;
        var result;
        var opts = options || {
        };
        if (opts.synchronous) {
            result = self.map.getViewport();
        }
        else {
            result = new Promise(function (resolve, reject) {
                self.getMap().then(function (olMap) {
                    resolve(olMap.getViewport());
                });
            });
        }
        return result;
    };

    TC.wrap.Map.prototype.isNative = function (map) {
        return map instanceof ol.Map;
    };

    TC.wrap.Map.prototype.isGeo = function () {
        var units = this.map.getView().getProjection().getUnits();
        return !units || units === ol.proj.Units.DEGREES;
    };

    TC.wrap.Map.prototype.addPopup = function (popupCtl) {
        const self = this;
        return new Promise(function (resolve, reject) {
            var draggable = popupCtl.options.draggable === undefined || popupCtl.options.draggable;
            TC.loadJS(
                draggable && !window.Draggabilly,
                [TC.apiLocation + 'lib/draggabilly/draggabilly.pkgd.min.js'],
                function () {
                    self.getMap().then(function (olMap) {
                        if (!popupCtl.popupDiv) {
                            // No popups yet
                            const popupDiv = TC.Util.getDiv();
                            popupCtl.popupDiv = popupDiv;
                            popupCtl.$popupDiv = $(popupDiv);
                            popupDiv.classList.add(TC.control.Popup.prototype.CLASS);
                            popupCtl.contentDiv = TC.Util.getDiv();
                            popupCtl.contentDiv.classList.add(TC.control.Popup.prototype.CLASS + '-content');
                            popupCtl.popupDiv.appendChild(popupCtl.contentDiv);
                            popupCtl.menuDiv = TC.Util.getDiv();
                            popupCtl.menuDiv.classList.add(TC.control.Popup.prototype.CLASS + '-menu');
                            popupCtl.popupDiv.appendChild(popupCtl.menuDiv);
                            self.parent.div.appendChild(popupDiv);

                            var popup = new ol.Overlay({
                                element: popupDiv,
                                positioning: ol.OverlayPositioning.BOTTOM_LEFT
                            });
                            olMap.addOverlay(popup);
                            popupCtl.wrap.popup = popup;

                            //popupCtl._firstRender.resolve();
                            //popupCtl.trigger(TC.Consts.event.CONTROLRENDER);
                            const olMapViewport = olMap.getViewport();

                            if (draggable) {
                                const container = popupCtl.popupDiv.parentElement;
                                popupCtl.popupDiv.classList.add(TC.Consts.classes.DRAGGABLE);


                                container.addEventListener('touchmove', function (e) {
                                    var parent = e.target;
                                    while (parent) {
                                        parent = parent.parentElement;
                                        if (parent  && parent.matches('.tc-ctl-finfo-layer-content')) {
                                            e.stopPropagation();
                                            break;
                                        }
                                    }
                                });

                                // Tuneamos Draggabilly para que acepte excepciones a los asideros del elemento.
                                const drag = new Draggabilly(container, {
                                    not: 'th,td, td *,input,select,.tc-ctl-finfo-coords'
                                });
                                drag.handleEvent = function (event) {
                                    if (this.options.not && event.target && event.target.matches(this.options.not)) {
                                        return;
                                    }
                                    Draggabilly.prototype.handleEvent.call(this, event);
                                };
                                drag.on('pointerDown', function (e, pointer) {
                                    var bcr = e.target.getBoundingClientRect();
                                    // Si estamos pulsando sobre una barra de scroll abortamos drag
                                    if (bcr.left + e.target.clientWidth < pointer.pageX || bcr.top + e.target.clientHeight < pointer.pageY) {
                                        drag._pointerCancel(e, pointer);
                                        return false;
                                    }
                                });
                                drag.on('dragStart', function (e, pointer) {
                                    popupCtl.setDragging(true);
                                    popupCtl._currentOffset = popup.getOffset();
                                    if (popupCtl._previousContainerPosition) {
                                        var mapSize = olMap.getSize();
                                        popup.setPosition(olMap.getCoordinateFromPixel([popupCtl._previousContainerPosition[0], mapSize[1] - popupCtl._previousContainerPosition[1]]));
                                        popupCtl._currentOffset = [0, 0];
                                        popup.setOffset(popupCtl._currentOffset);
                                        delete popupCtl._previousContainerPosition;
                                    }
                                    else {
                                        popupCtl._currentOffset = popup.getOffset();
                                    }
                                });
                                drag.on('dragEnd', function (e) {
                                    popupCtl.setDragging(false);
                                    var coord1 = olMap.getCoordinateFromPixel([0, 0]);
                                    var coord2 = olMap.getCoordinateFromPixel(popup.getOffset());
                                    var coordDelta = [coord2[0] - coord1[0], coord2[1] - coord1[1]];
                                    var position = popup.getPosition();
                                    popup.setPosition([position[0] + coordDelta[0], position[1] + coordDelta[1]]);
                                    popup.setOffset([0, 0]);
                                    popupCtl._currentOffset = [0, 0];

                                    const containerRect = container.getBoundingClientRect();
                                    popupCtl._previousContainerPosition = [containerRect.left, containerRect.bottom];
                                });
                                drag.on('dragMove', function (e, pointer, moveVector) {
                                    //popup.setOffset([popupCtl._currentOffset[0] + moveVector.x, popupCtl._currentOffset[1] + moveVector.y]);
                                });
                                //.drag(function (ev, dd) {
                                //    if (!ev.buttons && !Modernizr.touch) { // Evitamos que se mantenga el drag si no hay botón pulsado (p.e. en IE pulsando una scrollbar)
                                //        return false;
                                //    }
                                //    popup.setOffset([popupCtl._currentOffset[0] + dd.deltaX, popupCtl._currentOffset[1] + dd.deltaY]);
                                //}, {
                                //    not: 'th,td, td *,input,select,.tc-ctl-finfo-coords'
                                //    })                                
                            }

                            const mouseMoveHandler = function (e) {
                                var mapTarget = olMap.getTarget();
                                var hit = false;
                                if (!self.parent.activeControl || !self.parent.activeControl.isExclusive()) {
                                    var pixel = olMap.getEventPixel(e);
                                    hit = olMap.forEachFeatureAtPixel(pixel, function (feature, layer) {
                                        var result = true;
                                        if (feature._wrap && !feature._wrap.parent.showsPopup) {
                                            result = false;
                                        }
                                        return result;
                                    },
                                    {
                                        hitTolerance: hitTolerance
                                    });
                                }
                                if (hit) {
                                    mapTarget.style.cursor = 'pointer';
                                } else {
                                    mapTarget.style.cursor = '';
                                }
                            };

                            // change mouse cursor when over marker
                            olMapViewport.removeEventListener(MOUSEMOVE, mouseMoveHandler);
                            olMapViewport.addEventListener(MOUSEMOVE, mouseMoveHandler);
                        }
                    });
                    resolve();
                }
            );
        });
    };

    TC.wrap.Map.prototype.hidePopup = function (popupCtl) {
        var self = this;
        self.parent.currentFeature = null;
        if (popupCtl.popupDiv) {
            popupCtl.popupDiv.classList.remove(TC.Consts.classes.VISIBLE);
        }
    };

    TC.wrap.Map.prototype.manageSize = function () {
        const self = this;

        // Para controlar que el mapa no se vea borroso porque no encajan el width y height con los width y height de CSS
        const manageSize = function (event) {
            var pixelRatio = window.devicePixelRatio || 1;
            var canvas = event.context.canvas;
            var bounding = canvas.getBoundingClientRect();

            var idealWidth = pixelRatio * bounding.width;
            var idealHeight = pixelRatio * bounding.height;

            if (idealWidth !== bounding.width || !Number.isInteger(idealWidth)) {
                idealWidth = Math.round(idealWidth);
            }

            if (idealHeight !== bounding.height || !Number.isInteger(idealHeight)) {
                idealHeight = Math.round(idealHeight);
            }

            if (idealWidth !== bounding.width || idealHeight !== bounding.height) {
                var newSize = [idealWidth, idealHeight];
                event.target.setSize(newSize);
            }
        };

        if (!TC.Util.detectMobile()) {
            self.on(ol.render.EventType.POSTCOMPOSE, manageSize);
        }
    };

    var getFormatFromName = function (name) {
        switch (name) {
            case TC.Consts.layerType.KML:
            case TC.Consts.mimeType.KML:
                return new ol.format.KML({
                    showPointNames: false
                });
            case TC.Consts.layerType.GPX:
            case TC.Consts.mimeType.GPX:
                return new ol.format.GPX();
            case TC.Consts.layerType.GEOJSON:
            case TC.Consts.mimeType.GEOJSON:
            case TC.Consts.mimeType.JSON:
            case TC.Consts.format.JSON:
                return new ol.format.GeoJSON();
            case TC.Consts.format.GML2:
                return new ol.format.GML2();
            case TC.Consts.format.GML3:
                return new ol.format.GML3Patched();
            case TC.Consts.mimeType.GML:
            case TC.Consts.format.GML:
                return new ol.format.GML();
            case TC.Consts.format.TOPOJSON:
                return new ol.format.TopoJSON();
            case TC.Consts.format.WKT:
                return new ol.format.WKT();
            default:
                return null;
        }
    };

    TC.wrap.Map.prototype.exportFeatures = function (features, options) {
        var self = this;
        options = options || {};
        var nativeStyle = createNativeStyle({
            styles: self.parent.options.styles
        });
        var olFeatures = features.map(function (elm) {
            var result = elm.wrap.feature;
            // Si la feature no tiene estilo propio le ponemos el definido por la API
            if (!result.getStyle()) {
                result.setStyle(nativeStyle);
            }
            // Miramos si tiene texto, en cuyo caso la features se clona para no contaminar la feature orignal 
            // y al clon se le añade el texto como atributo (necesario para exportar etiquetas en KML y GPX)
            const text = getFeatureStyle.call(result).getText();
            if (text) {
                result = result.clone();
                result.setProperties({
                    name: text.getText()
                });
            }
            return result;
        });
        var format = getFormatFromName(options.format);

        if (format instanceof ol.format.KML) {
            // KML no tiene estilo para puntos aparte del de icono. Para puntos sin icono creamos uno en SVG.
            olFeatures = olFeatures
                .map(function (feature) {
                    const geom = feature.getGeometry();
                    if (geom instanceof ol.geom.Point) {
                        // Si el punto no tiene icono, creamos uno nuevo con un icono generado como data URI a partir del estilo
                        var style = getFeatureStyle.call(feature);
                        const shape = style.getImage();
                        if (shape instanceof ol.style.RegularShape) {
                            const radius = shape.getRadius();
                            const stroke = shape.getStroke();
                            const fill = shape.getFill();
                            const strokeWidth = stroke.getWidth();
                            const diameter = (2 * radius) + strokeWidth + 1;
                            const position = diameter / 2;
                            const canvas = document.createElement('canvas');
                            canvas.width = diameter;
                            canvas.height = diameter;
                            const vectorContext = ol.render.toContext(canvas.getContext('2d'), {
                                size: [diameter, diameter]
                            });
                            const text = style.getText();
                            style = style.clone();
                            style.setText(); // Quitamos el texto para que no salga en el canvas
                            vectorContext.setStyle(style);
                            vectorContext.drawGeometry(new ol.geom.Point([position, position]));
                            const newFeature = new ol.Feature(geom);
                            newFeature.setProperties(feature.getProperties());
                            newFeature.setStyle(new ol.style.Style({
                                image: new ol.style.Icon({
                                    src: canvas.toDataURL('image/png')
                                }),
                                text: text
                            }));
                            return newFeature;
                        }
                    }
                    return feature;
                });
            // KML no pone etiquetas a líneas y polígonos. En esos casos ponemos un punto con la etiqueta.
            const pointsToAdd = [];
            olFeatures.forEach(function (feature) {
                var style = getFeatureStyle.call(feature);
                const geometry = feature.getGeometry();
                const text = style.getText();
                var point;
                if (text) {
                    switch (true) {
                        case geometry instanceof ol.geom.LineString:
                            point = new ol.geom.Point(geometry.getCoordinateAt(0.5));
                            break;
                        case geometry instanceof ol.geom.Polygon:
                            point = geometry.getInteriorPoint();
                            break;
                        case geometry instanceof ol.geom.MultiLineString:
                            // Seleccionamos la línea más larga
                            const lineStrings = geometry.getLineStrings();
                            var maxLength = -1;
                            point = new ol.geom.Point(lineStrings[lineStrings
                                .map(function (line) {
                                    return line.getLength();
                                })
                                .reduce(function (prev, cur, idx) {
                                    if (cur > maxLength) {
                                        maxLength = cur;
                                        return idx;
                                    }
                                    return prev;
                                }, -1)].getCoordinateAt(0.5));
                            break;
                        case geometry instanceof ol.geom.MultiPolygon:
                            // Seleccionamos el polígono más grande
                            const polygons = geometry.getPolygons();
                            var maxArea = -1;
                            point = polygons[polygons
                                .map(function (polygon) {
                                    return polygon.getArea();
                                })
                                .reduce(function (prev, cur, idx) {
                                    if (cur > maxArea) {
                                        maxArea = cur;
                                        return idx;
                                    }
                                    return prev;
                                }, -1)].getInteriorPoint();
                            break;
                        default:
                            break;
                    }
                    if (point) {
                        const newFeature = new ol.Feature(point);
                        newFeature.setStyle(new ol.style.Style({
                            text: text.clone(),
                            image: new ol.style.Icon({
                                crossOrigin: 'anonymous',
                                src: TC.apiLocation + 'TC/css/img/transparent.gif'
                            })
                        }));
                        pointsToAdd.push(newFeature);
                    }
                }
            });
            if (pointsToAdd.length) {
                olFeatures = olFeatures.concat(pointsToAdd);
            }
        }

        if (format instanceof ol.format.GMLBase) {

            // Quitamos los espacios en blanco de los nombres de atributo en las features: no son válidos en GML.
            olFeatures = olFeatures.map(function (f) {
                return f.clone();
            });
            olFeatures.forEach(function (f) {
                const values = f.values_
                const keysToChange = [];
                for (var key in values) {
                    if (key.indexOf(' ') >= 0) {
                        keysToChange.push(key);
                    }
                }
                keysToChange.forEach(function (key) {
                    // Quitamos espacios en blanco y evitamos que empiece por un número
                    var newKey = key.replace(/ /g, '_');
                    if (/^\d/.test(newKey)) {
                        newKey = '_' + newKey;
                    }
                    if (key !== newKey) {
                        while (values[newKey] !== undefined) {
                            newKey += '_';
                        }
                    }
                    values[newKey] = values[key];
                    delete values[key];
                });
            });

            //Apañamos para que el GML sea válido. Si no lo hacemos, con IE, en ol-debug.js:36514 da un error porque node.localName no existe.
            format.featureNS = "sitna";
            format.featureType = "feature";
            var featuresNode = format.writeFeaturesNode(olFeatures, {
                featureProjection: self.parent.crs
            });

            var featureCollectionNode = ol.xml.createElementNS('http://www.opengis.net/gml',
                'FeatureCollection');
            ol.xml.setAttributeNS(featureCollectionNode, 'http://www.w3.org/2001/XMLSchema-instance',
                'xsi:schemaLocation', format.schemaLocation);
            featuresNode.removeAttribute('xmlns:xsi');
            featuresNode.removeAttribute('xsi:schemaLocation');
            featureCollectionNode.appendChild(featuresNode);
            //ol.xml.setAttributeNS(node, 'http://www.w3.org/2001/XMLSchema-instance',
            //    'xsi:schemaLocation', this.schemaLocation);
            //return featureCollectionNode.outerHTML;
        }

        if (format instanceof ol.format.GPX) {
            // Queremos exportar tracks en vez de routes. OpenLayers exporta LineStrings como routes y MultiLineStrings como tracks.
            olFeatures = olFeatures.map(function (f) {
                const geom = f.getGeometry();
                if (geom instanceof ol.geom.LineString) {
                    f = f.clone();
                    f.setGeometry(new ol.geom.MultiLineString([geom.getCoordinates()]));
                }
                return f;
            });
        }

        var result = format.writeFeatures(olFeatures, {
            dataProjection: 'EPSG:4326',
            featureProjection: self.parent.crs
        });
        if (format instanceof ol.format.GPX) {
            // Este formato no procesa bien las elevaciones cuando son nulas. Hemos hecho un preproceso para transformarlas en NaN y ahora hay que eliminarlas.
            result = result.replace(/<ele>NaN<\/ele>/g, '');
        }
        return result;
    };

    var isFileDrag = function (e) {
        for (var i = 0, len = e.dataTransfer.types.length; i < len; i++) {
            if (e.dataTransfer.types[i] === 'Files') {
                return true;
            }
        }
        return false;
    };

    var handleDragEnter = function (e) {
        var self = this;
        if (isFileDrag(e)) { // Solo hay gestión si lo que se arrastra es un archivo
            self.getMap()._wrap.parent.div.classList.add(TC.Consts.classes.DROP);
            e.preventDefault();
            e.stopPropagation();
        }
    };

    var handleDragExit = function (e) {
        var self = this;
        if (isFileDrag(e)) { // Solo hay gestión si lo que se arrastra es un archivo
            var map = self.getMap()._wrap.parent;
            if (e.target === self.target) {
                map.div.classList.remove(TC.Consts.classes.DROP);
            }
        }
    };

    TC.wrap.Map.prototype.enableDragAndDrop = function (options) {
        var self = this;
        var opts = options || {};
        var ddOptions = {
            formatConstructors: [
                ol.format.KML,
                ol.format.GPX,
                ol.format.GML3CRS84,
                ol.format.GML2CRS84,
                ol.format.GML3Patched,
                ol.format.GML2,
                ol.format.GeoJSON,
                function () {
                    return new ol.format.WKT({
                        splitCollection: true
                    });
                },
                ol.format.TopoJSON
            ]
        };
        if (opts.dropTarget) {
            ddOptions.target = TC.getDiv(opts.dropTarget);
        }
        else {
            ddOptions.target = self.parent.div;
        }
        var ddInteraction = new ol.interaction.DragAndDrop(ddOptions);
        ddInteraction.on(ol.interaction.DragAndDrop.EventType_.ADD_FEATURES, function (e) {
            var featurePromises = e.features ? e.features.map(function (elm) {
                return TC.wrap.Feature.createFeature(elm);
            }) : [];
            Promise.all(featurePromises).then(function (features) {
                var li = self.parent.getLoadingIndicator();
                if (li) {
                    li.removeWait(self._featureImportWaitId);
                }
                if (features.length && !(features.some(function (feature) {
                    return !feature.geometry
                }))) {
                    self.parent.trigger(TC.Consts.event.FEATURESIMPORT, {
                        features: features, fileName: e.file.name, dropTarget: e.target.target
                    });
                }
                else {
                    self.parent.trigger(TC.Consts.event.FEATURESIMPORTERROR, {
                        file: e.file
                    });
                }
            });
        });
        if (opts.once) {
            ddInteraction.map_ = self.map;
        }
        else {
            self.map.addInteraction(ddInteraction);
            var dropArea = ddInteraction.target ? ddInteraction.target : self.map.getViewport();
            // Añadidos gestores de eventos para mostrar el indicador visual de drop.
            var handleDrop = function (e) {
                if (isFileDrag(e)) { // Solo hay gestión si lo que se arrastra es un archivo
                    var map = self.parent;
                    if (ddInteraction.target === e.target) {
                        var li = map.getLoadingIndicator();
                        if (li) {
                            self._featureImportWaitId = li.addWait();
                        }
                        e.stopPropagation();
                    }
                    else {
                        e.preventDefault();
                    }
                    map.div.classList.remove(TC.Consts.classes.DROP);
                }
            };
            ddInteraction.dropListenKeys_.push(
                ol.events.listen(dropArea, ol.events.EventType.DRAGENTER,
                    handleDragEnter, ddInteraction)
            );
            ddInteraction.dropListenKeys_.push(
                ol.events.listen(document.body, ol.events.EventType.DRAGENTER,
                    handleDragEnter, ddInteraction)
            );
            ddInteraction.dropListenKeys_.push(
                ol.events.listen(dropArea, ol.events.EventType.DRAGOVER,
                    handleDragEnter, ddInteraction)
            );
            ddInteraction.dropListenKeys_.push(
                ol.events.listen(document.body, ol.events.EventType.DRAGOVER,
                    handleDragEnter, ddInteraction)
            );
            ddInteraction.dropListenKeys_.push(
                ol.events.listen(dropArea, ol.events.EventType.DROP,
                    handleDrop, ddInteraction)
            );
            ddInteraction.dropListenKeys_.push(
                ol.events.listen(document.body, ol.events.EventType.DROP,
                    handleDrop, ddInteraction)
            );
            ddInteraction.dropListenKeys_.push(
                ol.events.listen(document.body, 'dragleave',
                    handleDragExit, ddInteraction)
            );
            ddInteraction.dropListenKeys_.push(
                ol.events.listen(document.body, 'dragend',
                    handleDragExit, ddInteraction)
            );
            ddInteraction.dropListenKeys_.push(
                ol.events.listen(document.body, 'dragexit',
                    handleDragExit, ddInteraction)
            );
            document.addEventListener('mouseenter', function (e) {
                if (!e.buttons) {
                    self.parent.div.classList.remove(TC.Consts.classes.DROP);
                }
            }, false);
            self.ddEnabled = true;
        }
        return ddInteraction;
    };

    TC.wrap.Map.prototype.loadFiles = function (files, options) {
        var self = this;
        var ddInteraction;
        if (self.ddEnabled) {
            self.map.getInteractions().forEach(function (elm) {
                if (elm instanceof ol.interaction.DragAndDrop) {
                    ddInteraction = elm;
                }
            });
        }
        else {
            ddInteraction = self.enableDragAndDrop({
                once: true
            });
        }

        if (ddInteraction && options) {
            var currentTarget = ddInteraction.target;
            ddInteraction.target = options.control;
            const undoTarget = function (e) {
                ddInteraction.target = currentTarget;

                self.parent.off(TC.Consts.event.FEATURESIMPORT, undoTarget);
            };
            self.parent.on(TC.Consts.event.FEATURESIMPORT, undoTarget);
        }

        var li = self.parent.getLoadingIndicator();
        if (li) {
            self._featureImportWaitId = li.addWait();
        }
        ol.interaction.DragAndDrop.handleDrop_.call(ddInteraction, {
            dataTransfer: {
                files: files
            }
        });
    };

    /*
     *  getVisibility: gets the OpenLayers layer visibility
     *  Result: boolean
     */
    TC.wrap.Layer.prototype.getVisibility = function (visible) {
        var self = this;
        var result = false;
        if (self.layer) {
            result = self.layer.getVisible();
        }
        return result;
    };

    /*
     *  setVisibility: Sets the OpenLayers layer visibility
     *  Parameter: boolean
     */
    TC.wrap.Layer.prototype.setVisibility = function (visible) {
        var self = this;
        self.getLayer().then(function (layer) {
            layer.setVisible(visible);
        });
    };

    TC.wrap.Layer.prototype.isNative = function (layer) {
        return layer instanceof ol.layer.Layer;
    };

    TC.wrap.Layer.prototype.setProjection = function (options) {
        const self = this;
        options = options || {};
        const layer = self.parent;
        if (layer.map) {
            const unitRatio = getUnitRatio.call(self, {
                crs: options.crs,
                extentInDegrees: ol.proj.transformExtent(layer.map.getExtent(), layer.map.crs, 'EPSG:4326')
            });

            var resolutions = layer.getResolutions();
            if (resolutions && resolutions.length) {
                resolutions = resolutions.map(function (r) {
                    return r / unitRatio;
                });
                layer.wrap.layer.setMaxResolution(resolutions[0]);
                layer.wrap.layer.setMinResolution(resolutions[resolutions.length - 1]);
            }
            else {
                if (layer.minResolution) {
                    layer.minResolution = layer.minResolution / unitRatio;
                    self.layer.setMinResolution(layer.minResolution);
                }
                if (layer.maxResolution) {
                    layer.maxResolution = layer.maxResolution / unitRatio;
                    self.layer.setMaxResolution(layer.maxResolution);
                }
            }
        }
    };

    TC.wrap.layer.Raster.prototype.WmsParser = ol.format.WMSCapabilities;

    TC.wrap.layer.Raster.prototype.WmtsParser = ol.format.WMTSCapabilities;

    TC.wrap.Layer.prototype.addCommonEvents = function (layer) {
        var self = this;
        layer.on('change:visible', function () {
            if (self.parent.map) {
                self.parent.map.trigger(TC.Consts.event.LAYERVISIBILITY, {
                    layer: self.parent
                });
            }
        }, self.parent.map);
    };

    TC.wrap.layer.Raster.prototype.getGetMapUrl = function () {
        var result = null;
        var self = this;
        switch (self.getServiceType()) {
            case TC.Consts.layerType.WMS:
                var dcpType = self.parent.capabilities.Capability.Request.GetMap.DCPType;
                for (var i = 0; i < dcpType.length; i++) {
                    if (dcpType[i].HTTP && dcpType[i].HTTP.Get) {
                        result = dcpType[i].HTTP.Get.OnlineResource;
                        break;
                    }
                }
                break;
            case TC.Consts.layerType.WMTS:
                result = self.parent.capabilities.OperationsMetadata.GetTile.DCP.HTTP.Get[0].href;
                break;
            default:
                break;
        }
        const fragment = document.createDocumentFragment();
        const textarea = document.createElement('textarea');
        fragment.appendChild(textarea);
        textarea.innerHTML = result;
        result = textarea.textContent;
        return result;
    };

    TC.wrap.layer.Raster.prototype.getInfoFormats = function () {
        var result = null;
        var c = this.parent.capabilities;
        if (c.Capability && c.Capability.Request.GetFeatureInfo) {
            result = c.Capability.Request.GetFeatureInfo.Format;
        }
        return result;
    };

    TC.wrap.layer.Raster.infoFormatPreference = [
        'application/json',
        'application/vnd.ogc.gml/3.1.1',
        'application/vnd.ogc.gml',
        'application/vnd.esri.wms_featureinfo_xml',
        'text/html',
        'text/plain',
        'text/xml'
    ];

    TC.wrap.layer.Raster.prototype.getWMTSLayer = function () {
        var result = null;
        var self = this;
        var capabilities = self.parent.capabilities;
        if (capabilities && capabilities.Contents) {
            for (var i = 0; i < capabilities.Contents.Layer.length; i++) {
                var layer = capabilities.Contents.Layer[i];
                for (var j = 0; j < layer.TileMatrixSetLink.length; j++) {
                    if (self.parent.options.matrixSet === layer.TileMatrixSetLink[j].TileMatrixSet) {
                        result = layer;
                        break;
                    }
                }
            }
        }
        return result;
    };

    TC.wrap.layer.Raster.prototype.getTileMatrix = function (matrixSet) {
        var result = null;
        var self = this;
        var capabilities = self.parent.capabilities;
        if (capabilities && capabilities.Contents && capabilities.Contents.TileMatrixSet) {
            for (var i = 0; i < capabilities.Contents.TileMatrixSet.length; i++) {
                var tms = capabilities.Contents.TileMatrixSet[i];
                if (tms.Identifier === matrixSet) {
                    result = tms.TileMatrix;
                    break;
                }
            }
        }
        return result;
    };

    TC.wrap.layer.Raster.prototype.getScaleDenominators = function (node) {
        var result = [];
        var self = this;
        if (node.ScaleDenominator) {
            result = [node.ScaleDenominator, node.ScaleDenominator];
        }
        else {
            if (node.MinScaleDenominator || node.MaxScaleDenominator) {
                result = [node.MaxScaleDenominator, node.MinScaleDenominator];
            }
        }
        // Contemplamos el caso de una capa sin nombre: sus escalas válidas serán las de sus hijas.
        if (!result.length && !self.getName(node)) {
            var children = self.getLayerNodes(node);
            var max = -Infinity, min = Infinity;
            for (var i = 0, len = children.length; i < len; i++) {
                var childDenominators = self.getScaleDenominators(children[i]);
                if (childDenominators[0] > max) {
                    max = childDenominators[0];
                }
                if (childDenominators[1] < min) {
                    min = childDenominators[1];
                }
            }
            if (max > -Infinity && min < Infinity) {
                result = [max, min];
            }
        }
        return result;
    };

    TC.wrap.layer.Raster.prototype.getAttribution = function () {
        const self = this;
        const result = {};
        const capabilities = TC.capabilities[self.parent.url];

        if (capabilities) {
            if (capabilities.ServiceProvider) {
                result.name = capabilities.ServiceProvider.ProviderName.trim();
                result.site = capabilities.ServiceProvider.ProviderSite;
                if (result.site.href && result.site.href.trim().length > 0) {
                    result.site = result.site.href;
                }
            }
            else if (capabilities.ServiceIdentification) {
                result.name = capabilities.ServiceIdentification.Title.trim();
            }
            else {
                result.name = capabilities.Service.Title.trim();
            }
        }
        return result;
    };

    TC.wrap.layer.Raster.prototype.getInfo = function (name) {
        var self = this;
        var result = {};
        var capabilities = self.parent.capabilities;
        if (capabilities && capabilities.Capability) {
            var layerNodes = self.getAllLayerNodes();
            for (var i = 0; i < layerNodes.length; i++) {
                var l = layerNodes[i];
                if (self.parent.compareNames(self.getName(l), name)) {
                    if (l.Title) {
                        result.title = l.Title;
                    }
                    if (l.Abstract) {
                        result['abstract'] = l.Abstract;
                    }
                    result.legend = [];

                    var _process = function (value) {
                        var legend = this.getLegend(value);

                        if (legend.src)
                            result.legend.push({
                                src: legend.src, title: value.Title
                            });
                    };

                    var _traverse = function (o, func) {
                        if (o.Layer && o.Layer.length > 0) {
                            for (var i in o.Layer) {
                                //bajar un nivel en el árbol
                                _traverse(o.Layer[i], func);
                            }
                        } else {
                            func.apply(self, [o]);
                        }
                    };

                    //Obtenemos todas las leyendas de la capa o grupo de capas
                    _traverse(l, _process);

                    if (l.MetadataURL && l.MetadataURL.length) {
                        result.metadata = [];
                        for (var j = 0; j < l.MetadataURL.length; j++) {
                            var md = l.MetadataURL[j];
                            result.metadata.push({
                                format: md.Format, type: md.type, url: md.OnlineResource
                            });
                        }
                    }
                    result.queryable = l.queryable;
                    break;
                }
            }
        }
        return result;
    };

    TC.wrap.layer.Raster.prototype.getServiceType = function () {
        var result = null;
        var capabilities = this.parent.capabilities;
        if (capabilities.Capability && capabilities.Capability.Request && capabilities.Capability.Request.GetMap) {
            result = TC.Consts.layerType.WMS;
        }
        else if (capabilities.OperationsMetadata && capabilities.OperationsMetadata.GetTile) {
            result = TC.Consts.layerType.WMTS;
        }
        return result;
    };

    TC.wrap.layer.Raster.prototype.getServiceTitle = function () {
        var result = null;
        var capabilities = this.parent.capabilities;
        if (capabilities.Capability && capabilities.Service) {
            result = capabilities.Service.Title;
        }
        else if (capabilities.ServiceIdentification) {
            result = capabilities.ServiceIdentification.Title;
        }
        return result;
    };

    TC.wrap.layer.Raster.prototype.getRootLayerNode = function () {
        var self = this;
        var result;
        if (self.getServiceType() === TC.Consts.layerType.WMS) {
            result = self.parent.capabilities.Capability.Layer;
        }
        return result;
    };

    TC.wrap.layer.Raster.prototype.getName = function (node, ignorePrefix) {
        var result = node.Name;
        if (result && ignorePrefix) {
            var idx = result.indexOf(':');
            if (idx >= 0) {
                result = result.substr(idx + 1);
            }
        }
        return result;
    };

    TC.wrap.layer.Raster.prototype.getIdentifier = function (node) {
        return node.Identifier;
    };

    TC.wrap.layer.Raster.prototype.getLayerNodes = function (node) {
        var result = node.Layer;
        if (!$.isArray(result)) {
            if (result) {
                result = [result];
            }
            else {
                result = [];
            }
        }
        return result;
    };

    TC.wrap.layer.Raster.prototype.getAllLayerNodes = function () {
        var self = this;
        if (!self._layerList) {
            switch (self.getServiceType()) {
                case TC.Consts.layerType.WMS:
                    var getNodeArray = function getNodeArray(node) {
                        var r = [node];
                        var children = self.getLayerNodes(node);
                        for (var i = 0; i < children.length; i++) {
                            r = r.concat(getNodeArray(children[i]));
                        }
                        return r;
                    };
                    var root = self.getRootLayerNode();
                    self._layerList = root ? getNodeArray(root) : [];
                    break;
                case TC.Consts.layerType.WMTS:
                    self._layerList = self.parent.capabilities.Contents.Layer.slice();
                    break;
                default:
                    self._layerList = [];
                    break;
            }
        }
        return self._layerList;
    };

    TC.wrap.layer.Raster.prototype.normalizeLayerNode = function (node) {
        return node;
    };

    TC.wrap.layer.Raster.prototype.normalizeCapabilities = function (capabilities) {
        return capabilities;
    };


    TC.wrap.layer.Raster.prototype.getLegend = function (node) {
        var result = {};
        var styles = node.Style;
        if (styles && styles.length) {
            if (styles.length && styles[0].LegendURL && styles[0].LegendURL.length) {
                var legend = styles[0].LegendURL[0];

                const fragment = document.createDocumentFragment();
                const textarea = document.createElement('textarea');
                fragment.appendChild(textarea);
                textarea.innerHTML = legend.OnlineResource;
                result.src = textarea.textContent;
                // Eliminado porque GeoServer miente con el tamaño de sus imágenes de la leyenda
                //if (legend.size) {
                //    result.width = legend.size[0];
                //    result.height = legend.size[1];
                //}
            }
        }
        return result;
    };

    TC.wrap.layer.Raster.prototype.isCompatible = function (crs) {
        var self = this;
        var result = true;
        var layer = self.parent;
        switch (self.getServiceType()) {
            case TC.Consts.layerType.WMS:
                if (layer.capabilities && layer.capabilities.Capability && layer.capabilities.Capability.Layer) {
                    if (layer.names.length > 0) {
                        var names = layer.names.slice(0);
                        var _isCompatible = function _isCompatible(nodes, name, inCrs) {
                            var r = false;
                            if (nodes) {
                                for (var i = 0; i < nodes.length; i++) {
                                    var n = nodes[i];
                                    const itemCRS = n.CRS || n.SRS;
                                    const crsList = Array.isArray(itemCRS) ? itemCRS : [itemCRS];
                                    var isIn = inCrs || $.inArray(crs, crsList) >= 0;
                                    if (layer.compareNames(self.getName(n), name)) {
                                        if (isIn) {
                                            r = true;
                                        }
                                        break;
                                    }
                                    else if (_isCompatible(n.Layer, name, isIn)) {
                                        r = true;
                                        break;
                                    }
                                }
                            }
                            return r;
                        };
                        while (names.length > 0) {
                            if (!_isCompatible([layer.capabilities.Capability.Layer], names.pop())) {
                                result = false;
                                break;
                            }
                        }
                    }
                }
                break;
            case TC.Consts.layerType.WMTS:
                result = false;
                if (layer.capabilities && layer.capabilities.Contents && layer.capabilities.Contents.TileMatrixSet) {
                    var tms = layer.capabilities.Contents.TileMatrixSet;
                    for (var i = 0; i < tms.length; i++) {
                        if (tms[i].Identifier === layer.options.matrixSet) {
                            result = TC.Util.CRSCodesEqual(crs, tms[i].SupportedCRS);
                            break;
                        }
                    }
                }
                break;
            default:
                break;
        }
        return result;
    };

    TC.wrap.layer.Raster.prototype.getCompatibleCRS = function () {
        var self = this;
        var result = [];
        var layer = self.parent;
        switch (self.getServiceType()) {
            case TC.Consts.layerType.WMS:
                if (layer.capabilities && layer.capabilities.Capability && layer.capabilities.Capability.Layer) {
                    if (layer.names.length > 0) {
                        const crsLists = layer.names
                            .map(function (name) {
                                return layer
                                    .getNodePath(name) // array de nodos
                                    .map(function (node) {
                                        const itemCRS = node.CRS || node.SRS || [];
                                        const crsList = Array.isArray(itemCRS) ? itemCRS : [itemCRS];
                                        return $.isArray(crsList) ? crsList : [crsList];
                                    }) // array de arrays de crs
                                    .reduce(function (prev, cur) {
                                        if (prev.length === 0) {
                                            return cur;
                                        }
                                        cur.forEach(function (elm) {
                                            if (prev.indexOf(elm) < 0) {
                                                prev[prev.length - 1] = elm;
                                            }
                                        });// array con todos los crs
                                        return prev;
                                    }, []);
                            });

                        if (crsLists.length === 1) {
                            result = crsLists[0];
                        } else {
                            const otherCrsLists = crsLists.slice(1);
                            result = crsLists[0].filter(function (elm) {
                                return otherCrsLists.every(function (crsList) {
                                    return crsList.indexOf(elm) >= 0;
                                });
                            });
                        }
                    }
                }
                break;
            case TC.Consts.layerType.WMTS:
                if (layer.capabilities && layer.capabilities.Contents) {
                    layer.capabilities.Contents.Layer
                        .filter(function (l) {
                            return l.Identifier === layer.layerNames;
                        })  // La capa de interés
                        .forEach(function (l) {
                            const tileMatrixSets = l.TileMatrixSetLink
                                .map(function (tmsl) {
                                    return tmsl.TileMatrixSet;
                                });
                            result = layer.capabilities.Contents.TileMatrixSet
                                .filter(function (tms) {
                                    return tileMatrixSets.indexOf(tms.Identifier) >= 0;
                                }) // TileMatrixSets asociados a la capa de interés
                                .map(function (tms) {
                                    return tms.SupportedCRS;
                                });
                        });
                }
                break;
            default:
                break;
        }
        return result;
    };

    TC.wrap.layer.Raster.prototype.getCompatibleLayers = function (crs) {
        var self = this;
        var result = [];
        var layer = self.parent;
        switch (self.getServiceType()) {
            case TC.Consts.layerType.WMS:
                if (layer.capabilities && layer.capabilities.Capability && layer.capabilities.Capability.Layer) {
                    var _fnrecursive = function (item, crs, inCrs) {
                        var crsToCheck = item.CRS || item.SRS;
                        var itemCRS = Array.isArray(crsToCheck) ? crsToCheck : [crsToCheck];
                        var isIn = inCrs || $.inArray(crs, itemCRS) >= 0;
                        if (isIn && item.Name) result[result.length] = item.Name;
                        if (item.Layer) {
                            for (var i = 0; i < item.Layer.length; i++) {
                                _fnrecursive(item.Layer[i], crs, isIn);
                            }
                        }
                    }
                    _fnrecursive(layer.capabilities.Capability.Layer, crs);
                }
                break;
            case TC.Consts.layerType.WMTS:
                if (layer.capabilities && layer.capabilities.Contents && layer.capabilities.Contents.TileMatrixSet) {
                    var tmsList = layer.capabilities.Contents.TileMatrixSet;
                    for (var i = 0, ii = tmsList.length; i < ii; i++) {
                        var tms = tmsList[i];
                        if (TC.Util.CRSCodesEqual(crs, tms.SupportedCRS)) {
                            var tmsIdentifier = tms.Identifier;
                            var layerList = layer.capabilities.Contents.Layer;
                            for (var j = 0, jj = layerList.length; j < jj; j++) {
                                var tmsLinkList = layerList[j].TileMatrixSetLink;
                                for (var k = 0, kk = tmsLinkList.length; k < kk; k++) {
                                    if (tmsLinkList[k].TileMatrixSet === tmsIdentifier) {
                                        result[result.length] = layerList[j].Identifier;
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
                break;
            default:
                break;
        }
        return result;
    };

    TC.wrap.layer.Raster.prototype.getCompatibleMatrixSets = function (crs) {
        var self = this;
        var result = [];
        normalizeProjection({
            crs: crs
        });
        var layer = self.parent;
        if (self.getServiceType() === TC.Consts.layerType.WMTS) {
            var layerList = layer.capabilities.Contents.Layer;
            var tmsList = layer.capabilities.Contents.TileMatrixSet;
            for (var i = 0, ii = layerList.length; i < ii; i++) {
                if (layer.layerNames === layerList[i].Identifier) {
                    var tmsLinkList = layerList[i].TileMatrixSetLink;
                    for (var j = 0, jj = tmsLinkList.length; j < jj; j++) {
                        var tmsLink = tmsLinkList[j];
                        for (var k = 0, kk = tmsList.length; k < kk; k++) {
                            var tms = tmsList[k];
                            if (tms.Identifier === tmsLink.TileMatrixSet) {
                                if (TC.Util.CRSCodesEqual(crs, tms.SupportedCRS)) {
                                    result[result.length] = tms.Identifier;
                                }
                                break;
                            }
                        }
                    }
                }
            }
        }
        return result;
    };

    TC.wrap.layer.Raster.prototype.setWMTSUrl = function () {
        var self = this;

        self.getLayer().then(function (l) {
            self.parent.options = self.parent.options || {};
            var urls = l.getSource().getUrls();
            self.parent.options.urlPattern = urls[urls.length - 1];
        });
    };

    TC.wrap.layer.Raster.prototype.createWMSLayer = function (url, params, options) {
        const self = this;
        var result = null;

        var source = new ol.source.ImageWMS({
            url: url,
            crossOrigin: options.map ? options.map.options.crossOrigin : undefined,
            params: params,
            extent: TC.Cfg.initialExtent,
            ratio: TC.Cfg.imageRatio,
            imageLoadFunction: $.proxy(self.parent.getImageLoad, self.parent)
        });

        source.on(ol.source.Image.EventType_.IMAGELOADSTART, function (e) {
            self.trigger(TC.Consts.event.BEFORETILELOAD, {
                tile: e.image.getImage()
            });
        });
        source.on(ol.source.Image.EventType_.IMAGELOADEND, function (e) {
            self.trigger(TC.Consts.event.TILELOAD, {
                tile: e.image.getImage()
            });
        });
        source.on(ol.source.Image.EventType_.IMAGELOADERROR, function (e) {
            self.trigger(TC.Consts.event.TILELOAD, {
                tile: e.image.getImage()
            });
        });


        var layerOptions = {
            visible: !!params.LAYERS.length || (options && options.method && options.method === 'POST'), //Las capas de temáticos cargadas por POST no tienen el atributo LAYERS
            source: source
        };

        if (options.minResolution) {
            layerOptions.minResolution = options.minResolution;
        }
        if (options.maxResolution) {
            layerOptions.maxResolution = options.maxResolution;
        }
        result = new ol.layer.Image(layerOptions);

        result._wrap = self;

        self.addCommonEvents(result);

        return result;
    };

    var createWmtsSource = function (options) {
        var self = this;
        var result = null;
        var sourceOptions = ol.source.WMTS.optionsFromCapabilities(self.parent.capabilities, {
            layer: options.layerNames,
            matrixSet: options.matrixSet,
            crossOrigin: options.map ? options.map.options.crossOrigin : undefined,
            requestEncoding: options.encoding,
            format: options.format,
        });
        var https = 'https:';

        if (sourceOptions) {
            if (location.protocol === https) {
                sourceOptions.urls = sourceOptions.urls.map(function (elm) {
                    return elm.replace('http:', https);
                });
            }

            sourceOptions.crossOrigin = options.map ? options.map.options.crossOrigin : undefined;

            result = new ol.source.WMTS(sourceOptions);
            result.setTileLoadFunction($.proxy(self.parent.getImageLoad, self.parent));

            result.on(ol.source.TileEventType.TILELOADSTART, function (e) {
                self.trigger(TC.Consts.event.BEFORETILELOAD, {
                    tile: e.tile.getImage()
                });
            });
            result.on(ol.source.TileEventType.TILELOADEND, function (e) {
                self.trigger(TC.Consts.event.TILELOAD, {
                    tile: e.tile.getImage()
                });
            });
            result.on(ol.source.TileEventType.TILELOADERROR, function (e) {
                self.trigger(TC.Consts.event.TILELOAD, {
                    tile: e.tile.getImage()
                });
            });

            var prevFn = $.proxy(result.getResolutions, result);
            result.getResolutions = function () {
                var resolutions = prevFn();
                var matrix = self.parent.getLimitedMatrixSet();
                //esto está mal, porque matrix podría empezar más abajo (tener recortado por ambos lados)
                if (matrix && matrix.length) {
                    var ix = matrix[0].matrixIndex;
                    resolutions = resolutions.slice(ix, matrix.length + ix);
                }

                return resolutions;
            };
        }

        return result;
    };

    TC.wrap.layer.Raster.prototype.createWMTSLayer = function (options) {
        const self = this;
        var result = null;

        var source = createWmtsSource.call(self, options);

        if (source) {
            var layerOptions = {
                source: source
            };
            if (options.minResolution) {
                layerOptions.minResolution = options.minResolution;
            }
            if (options.maxResolution) {
                layerOptions.maxResolution = options.maxResolution;
            }
            result = new ol.layer.Tile(layerOptions);
            result._wrap = self;

            self.addCommonEvents(result);

            var resolutions = source.getResolutions();
            //Este +1 tan chungo es porque, en el caso en que la resolución del mapa es igual a la máxima del layer, openLayers lo oculta
            result.setMaxResolution(resolutions[0] + 1);
            result.setMinResolution(resolutions[resolutions.length - 1]);
        }

        return result;
    };


    /*
     *  getParams: Gets the WMS layer getmap parameters
     *  Returns: object
     */
    TC.wrap.layer.Raster.prototype.getParams = function () {
        return this.layer.getSource().getParams();
    };

    /*
     *  setParams: Sets the WMS layer getmap parameters
     *  Parameter: object
     */
    TC.wrap.layer.Raster.prototype.setParams = function (params) {
        this.layer.getSource().updateParams(params);
    };

    TC.wrap.layer.Raster.prototype.setMatrixSet = function (matrixSet) {
        const self = this;
        const oldResolutions = self.layer.getSource().getResolutions();
        if (self.parent.type === TC.Consts.layerType.WMTS) {
            const newSource = createWmtsSource.call(self, $.extend({}, self.parent.options, { matrixSet: matrixSet }));
            const newResolutions = newSource.getResolutions();
            const newMaxResolution = newResolutions[0]
            const newMinResolution = newResolutions[newResolutions.length - 1];
            self.layer.setMaxResolution(newMaxResolution);
            self.layer.setMinResolution(newMinResolution);
            if (self.parent.minResolution) {
                self.parent.minResolution = newMinResolution;
            }
            if (self.parent.maxResolution) {
                self.parent.maxResolution = newMaxResolution;
            }
            self.layer.setSource(newSource);
        }
    };

    TC.wrap.layer.Raster.prototype.getResolutions = function () {
        if (this.layer.getSource) {
            var ts = this.layer.getSource();
            if (ts.getResolutions && ts.getResolutions != goog.abstractMethod) return ts.getResolutions();
            else return [];
        }
        else {
            return [];
        }
    };

    TC.wrap.Geometry = {
        getNearest: function (point, candidates) {
            var pline = new ol.geom.LineString(candidates);
            return pline.getClosestPoint(point);
        }
    };

    // En OL3 la imagen tiene el tamaño original. Escalamos si hace falta.
    var setScaleFunction = function (imageStyle, iconWidth, olFeat) {
        if (imageStyle) {
            var setScaleForWidth = function (imgWidth) {
                var markerWidth = (olFeat && olFeat._wrap ? olFeat._wrap.parent.options.width : null) || iconWidth;
                if (markerWidth < imgWidth) {
                    var factor = markerWidth / imgWidth;
                    imageStyle.setScale(factor);
                }
            };
            var imageSize = imageStyle.getSize();
            if (imageSize) {
                setScaleForWidth(imageSize[0]);
            }
            else {
                var img = imageStyle.getImage();
                if (img.naturalWidth) {
                    setScaleForWidth(img.naturalWidth);
                }
                else {
                    const fragment = document.createDocumentFragment();
                    const img = document.createElement('img');
                    img.src = imageStyle.getSrc();
                    img.addEventListener('load', function () {
                        setScaleForWidth(this.naturalWidth);
                    });
                    fragment.appendChild(img);
                }
            }
        }
    };

    var getStyleValue = function (property, feature) {
        var result = property;
        var olFeat = feature && feature.wrap && feature.wrap.feature;
        if (typeof property === 'string') {
            var match = property.match(/^\$\{(.+)\}$/);
            if (match && olFeat) {
                // Permitimos el formato ${prop.subprop.subsubprop}
                var m = match[1].split('.');
                var r = olFeat.getProperties();
                for (var i = 0; i < m.length && r !== undefined; i++) {
                    r = r[m[i]];
                }
                if (r === undefined) {
                    r = feature.data;
                    for (var i = 0; i < m.length && r !== undefined; i++) {
                        r = r[m[i]];
                    }
                }
                result = r;
            }
        }
        else if ($.isFunction(property)) {
            result = property(feature);
        }
        return result;
    };

    var getNativeStyle = function (olFeat) {
        var result = olFeat.getStyle();
        if ($.isFunction(result)) {
            result = result.call(olFeat);
        }
        if ($.isArray(result)) {
            result = result[0];
        }
        return result;
    };

    // Transformación de opciones de estilo en un estilo nativo OL3.
    var createNativeStyle = function (options, olFeat) {
        var nativeStyleOptions = {
        };

        var feature;
        var isPoint, isLine, isPolygon;
        if (olFeat) {
            switch (olFeat.getGeometry().getType()) {
                case 'Point':
                case 'MultiPoint':
                    isPoint = true;
                    break;
                case 'LineString':
                case 'MultiLineString':
                    isLine = true;
                    break;
                case 'Polygon':
                case 'MultiPolygon':
                    isPolygon = true;
                    break;
            }
            if (olFeat._wrap) {
                feature = olFeat._wrap.parent;
            }
            else {
                // Si la API SITNA no ha completado su feature, creamos un mock-up para que no fallen las funciones de estilo
                feature = {
                    id: TC.wrap.Feature.prototype.getId.call({
                        feature: olFeat
                    }), // GLS añado el id de la feature para poder filtrar por la capa a la cual pertenece                    
                    features: olFeat.get('features'),
                    getData: function () {
                        return TC.wrap.Feature.prototype.getData.call({
                            feature: olFeat
                        });
                    }
                };


            }
        }
        var isCluster = feature && $.isArray(feature.features) && feature.features.length > 1 && options.cluster;
        var styles;
        if (isCluster) {
            styles = $.extend(true, {}, TC.Cfg.styles.cluster, options.cluster.styles);
        }
        else {
            styles = options.styles || TC.Cfg.styles;
        }

        var styleOptions = {};
        if (styles.line && (isLine || !olFeat)) {
            styleOptions = styles.line;
            nativeStyleOptions.stroke = new ol.style.Stroke({
                color: getStyleValue(styles.line.strokeColor, feature),
                width: getStyleValue(styles.line.strokeWidth, feature),
                lineDash: styles.line.lineDash
            });
        }

        if (styles.polygon && (isPolygon || !olFeat)) {
            styleOptions = styles.polygon;
            nativeStyleOptions.fill = new ol.style.Fill({
                color: getRGBA(getStyleValue(styles.polygon.fillColor, feature), getStyleValue(styles.polygon.fillOpacity, feature))
            });
            nativeStyleOptions.stroke = new ol.style.Stroke({
                color: getStyleValue(styles.polygon.strokeColor, feature),
                width: getStyleValue(styles.polygon.strokeWidth, feature),
                lineDash: styles.polygon.lineDash
            });
        }

        if (styles.point && (isPoint || !olFeat)) {
            styleOptions = styles.point;
            var circleOptions = {
                radius: getStyleValue(styleOptions.radius, feature) ||
                (getStyleValue(styleOptions.height, feature) + getStyleValue(styleOptions.width, feature)) / 4
            };
            if (styleOptions.fillColor) {
                circleOptions.fill = new ol.style.Fill({
                    color: getRGBA(getStyleValue(styleOptions.fillColor, feature), getStyleValue(styleOptions.fillOpacity, feature))
                });
            }
            if (styleOptions.strokeColor) {
                circleOptions.stroke = new ol.style.Stroke({
                    color: getStyleValue(styleOptions.strokeColor, feature),
                    width: getStyleValue(styleOptions.strokeWidth, feature),
                    lineDash: styleOptions.lineDash
                });
            }

            if (!isNaN(circleOptions.radius))
                nativeStyleOptions.image = new ol.style.Circle(circleOptions);
        }

        if (styleOptions.label) {
            nativeStyleOptions.text = createNativeTextStyle(styleOptions, feature);
        }

        if (styles.marker && (isPoint || !olFeat)) {
            styleOptions = styles.marker;
            var ANCHOR_DEFAULT_UNITS = 'fraction';
            if (styleOptions.url) {
                nativeStyleOptions.image = new ol.style.Icon({
                    crossOrigin: 'anonymous',
                    anchor: styleOptions.anchor,
                    anchorXUnits: styleOptions.anchorXUnits || ANCHOR_DEFAULT_UNITS,
                    anchorYUnits: styleOptions.anchorYUnits || ANCHOR_DEFAULT_UNITS,
                    src: styleOptions.url
                });
                nativeStyleOptions.text = createNativeTextStyle(styleOptions, feature);
            }
        }

        return [new ol.style.Style(nativeStyleOptions)];
    };

    const createNativeTextStyle = function (styleObj, feature) {
        if (!styleObj || !styleObj.label) {
            return;
        }

        const textOptions = {
            text: '' + getStyleValue(styleObj.label, feature),
        };
        //const olGeom = feature.wrap.feature.getGeometry();
        //if (olGeom instanceof ol.geom.LineString || olGeom instanceof ol.geom.MultiLineString) {
        //    textOptions.placement = ol.style.TextPlacement.LINE;
        //}
        if (styleObj.fontSize) {
            textOptions.font = getStyleValue(styleObj.fontSize, feature) + 'pt sans-serif';
        }
        if (styleObj.angle) {
            textOptions.rotation = -Math.PI * getStyleValue(styleObj.angle, feature) / 180;
        }
        if (styleObj.fontColor) {
            textOptions.fill = new ol.style.Fill({
                color: getRGBA(getStyleValue(styleObj.fontColor, feature), 1)
            });
        }
        if (styleObj.labelOutlineColor) {
            textOptions.stroke = new ol.style.Stroke({
                color: getRGBA(getStyleValue(styleObj.labelOutlineColor, feature), 1),
                width: getStyleValue(styleObj.labelOutlineWidth, feature)
            });
        }
        if (styleObj.labelOffset) {
            textOptions.offsetX = styleObj.labelOffset[0];
            textOptions.offsetY = styleObj.labelOffset[1];
        }
        return new ol.style.Text(textOptions);
    };

    var toHexString = function (number) {
        var result = number.toString(16);
        if (result.length === 1) {
            result = '0' + result;
        }
        return result;
    };

    var getHexColorFromArray = function (colorArray) {
        return '#' + toHexString(colorArray[0]) + toHexString(colorArray[1]) + toHexString(colorArray[2])
    };

    var getStyleFromNative = function (olStyle, olFeat) {
        var result = {
        };
        if ($.isFunction(olStyle)) {
            if (olFeat) {
                olStyle = olStyle(olFeat);
            }
        }
        if ($.isArray(olStyle)) {
            olStyle = olStyle[0];
        }
        if (!$.isFunction(olStyle)) {
            var color;
            var stroke;
            var fill;
            var image = olStyle.getImage();
            if (image) {
                if (image instanceof ol.style.RegularShape) {
                    stroke = image.getStroke();
                    color = ol.color.asArray(stroke.getColor());
                    result.strokeColor = getHexColorFromArray(color);
                    result.strokeWidth = stroke.getWidth();
                    fill = image.getFill();
                    if (fill) {
                        color = ol.color.asArray(fill.getColor());
                        result.fillColor = getHexColorFromArray(color);
                        result.fillOpacity = color[3];
                    }
                }
                else {
                    result.url = image.getSrc();
                    var size = image.getSize();
                    if (size) {
                        result.width = size[0];
                        result.height = size[1];
                        result.anchor = image.getAnchor();
                        if (result.anchor) {
                            result.anchor[0] = result.anchor[0] / result.width;
                            result.anchor[1] = result.anchor[1] / result.height;
                        }
                    }
                }
            }
            else {
                stroke = olStyle.getStroke();
                if (stroke) {
                    color = ol.color.asArray(stroke.getColor());
                    result.strokeColor = getHexColorFromArray(color);
                    result.strokeWidth = stroke.getWidth();
                    result.lineDash = stroke.getLineDash();
                }
                fill = olStyle.getFill();
                if (fill) {
                    color = ol.color.asArray(fill.getColor());
                    result.fillColor = getHexColorFromArray(color);
                    result.fillOpacity = color[3];
                }
            }
        }
        return result;
    };

    TC.wrap.layer.Vector.prototype.getStyle = function () {
        return getStyleFromNative(this.layer.getStyle());
    };

    TC.wrap.layer.Vector.prototype.reloadSource = function () {
        const self = this;
        return new Promise(function (resolve, reject) {
            const layerOptions = self.createVectorSource(self.parent, self.createStyles(self.parent));

            if (self.parent.type === TC.Consts.layerType.WFS) {
                var listenerKey = layerOptions.source.on('change', function (e) {
                    if (layerOptions.source.getState() == 'ready') {
                        ol.Observable.unByKey(listenerKey);

                        resolve();
                    }
                });
            }

            var features = self.layer.getSource().getFeatures();
            self.layer.setSource(layerOptions.source);

            if (layerOptions.style)
                self.layer.setStyle(layerOptions.style);

            if (self.parent.type != TC.Consts.layerType.WFS) {
                layerOptions.source.addFeatures(features);
                resolve();
            }
        });
    };

    TC.wrap.layer.Vector.prototype.import = function (options) {
        var self = this;
        var opts = $.extend({
        }, options);
        opts.type = options.format;

        var oldFeatures = self.layer.getSource().getFeatures();
        var layerOptions = self.createVectorSource(opts, self.createStyles(self.parent));
        self.layer.setSource(layerOptions.source);
        if (layerOptions.style) {
            self.layer.setStyle(layerOptions.style);
        }

        layerOptions.source.addFeatures(oldFeatures);
    };

    const getIcon = function (olFeat) {
        var result = null;
        var style = getNativeStyle(olFeat);
        if (style) {
            var img = style.getImage();
            if (img instanceof ol.style.Icon) {
                result = img.getSrc();
            }
        }
        return result;
    };

    const createFeatureFromNative = function (olFeat) {
        if (!olFeat._wrapPromise) { // Si no se ha llamado antes a esta función para esta feature
            olFeat._wrapPromise = new Promise(function (resolve, reject) {
                var options;
                var geom = olFeat.getGeometry();
                const olStyle = olFeat.getStyle();
                if (olStyle) {
                    options = getStyleFromNative(olStyle, olFeat);
                }

                const resolveFn = function (ctorName) {
                    if (ctorName) {
                        TC.loadJS(
                            !TC.feature || !TC.feature[ctorName],
                            TC.apiLocation + 'TC/feature/' + ctorName,
                            function () {
                                resolve(new TC.feature[ctorName](olFeat, options));
                            }
                        );
                    }
                    else {
                        resolve(new TC.Feature(olFeat, options));
                    }
                };

                if (geom instanceof ol.geom.Point) {
                    if (getIcon(olFeat)) {
                        resolveFn('Marker');
                    }
                    else {
                        resolveFn('Point');
                    }
                }
                else if (geom instanceof ol.geom.LineString) {
                    resolveFn('Polyline');
                }
                else if (geom instanceof ol.geom.Polygon) {
                    resolveFn('Polygon');
                }
                else if (geom instanceof ol.geom.MultiLineString) {
                    resolveFn('MultiPolyline');
                }
                else if (geom instanceof ol.geom.MultiPolygon) {
                    resolveFn('MultiPolygon');
                }
                else {
                    resolveFn();
                }
            });
        }
        return olFeat._wrapPromise;
    };

    TC.wrap.layer.Vector.prototype.createVectorSource = function (options, nativeStyle) {
        var self = this;

        var createGenericLoader = function (url, format) {
            var internalLoader = ol.featureloader.xhr(url, format);
            return function (extent, resolution, projection) {
                self.parent.state = TC.Layer.state.LOADING;
                if (self.parent.map) {
                    self.parent.map.trigger(TC.Consts.event.BEFORELAYERUPDATE, {
                        layer: self.parent
                    });
                }
                internalLoader.call(this, extent, resolution, projection);
            };
        };
        var usesGenericLoader = false;

        var source;
        var vectorOptions;

        var getMimeTypeFromUrl = function (url) {
            var idx = url.indexOf('?');
            if (idx >= 0) {
                url = url.substr(0, idx);
            }
            else {
                idx = url.indexOf('#');
                if (idx >= 0) {
                    url = url.substr(0, idx);
                }
            }
            switch (url.substr(url.lastIndexOf('.') + 1).toLowerCase()) {
                case 'kml':
                    return TC.Consts.mimeType.KML;
                case 'json':
                case 'geojson':
                    return TC.Consts.mimeType.GEOJSON;
                case 'gml':
                    return TC.Consts.mimeType.GML;
                case 'gpx':
                    return TC.Consts.mimeType.GPX;
                default:
                    return null;
            }
        };

        if ($.isArray(options.url) || options.urls) {
            var urls = options.urls || options.url;
            urls = $.map(urls, function (elm, idx) {
                return TC.proxify(elm);
            });
            vectorOptions = {
                url: urls,
                format: new ol.format.KML({
                    showPointNames: false
                }),
                projection: options.crs
            };
        }
        else if (options.url && options.type !== TC.Consts.layerType.WFS) {
            vectorOptions = {
                url: TC.proxify(options.url),
                projection: options.crs
            };
            vectorOptions.format = getFormatFromName(options.format) || getFormatFromName(getMimeTypeFromUrl(options.url)) || getFormatFromName(options.type);
            vectorOptions.loader = createGenericLoader(vectorOptions.url, vectorOptions.format);
            usesGenericLoader = true;
        }
        else if (options.data) {
            vectorOptions = {
                projection: options.crs,
                loader: function (extent, resolution, projection) {
                    self.parent.state = TC.Layer.state.LOADING;
                    if (self.parent.map) {
                        self.parent.map.trigger(TC.Consts.event.BEFORELAYERUPDATE, {
                            layer: self.parent
                        });
                    }
                    var format = this.getFormat();
                    try {
                        var fs = format.readFeatures(options.data, {
                            featureProjection: projection
                        });
                        this.addFeatures(fs);
                        self.parent.state = TC.Layer.state.IDLE;
                        if (self.parent.map) {
                            self.parent.map.trigger(TC.Consts.event.LAYERUPDATE, {
                                layer: self.parent, newData: data
                            });
                        }
                    }
                    catch (e) {
                        self.parent.state = TC.Layer.state.IDLE;
                        if (self.parent.map) {
                            self.parent.map.trigger(TC.Consts.event.LAYERERROR, {
                                layer: self.parent, reason: e.message
                            });
                        }
                    }
                }
            };
            vectorOptions.format = getFormatFromName(options.format) || getFormatFromName(options.type);
        }
        else if (options.type == TC.Consts.layerType.WFS) {
            var outputFormat;
            var mimeType;
            switch (options.outputFormat) {
                case TC.Consts.format.JSON:
                    outputFormat = new ol.format.GeoJSON({
                        geometryName: options.geometryName
                    });
                    mimeType = 'json';
                    break;
                case TC.Consts.format.GML3:
                    outputFormat = new ol.format.GML3Patched();
                    mimeType = TC.Consts.mimeType.GML;
                    break;
                default:
                    outputFormat = new ol.format.GML2();
                    mimeType = TC.Consts.mimeType.GML;
                    break;
            }
            vectorOptions = {
                format: outputFormat,
                loader: function (extent, resolution, projection) {
                    var sOrigin = this;
                    var serviceUrl = options.url;
                    if (serviceUrl) {
                        self.parent.state = TC.Layer.state.LOADING;
                        self.parent.map.trigger(TC.Consts.event.BEFORELAYERUPDATE, {
                            layer: self.parent
                        });
                        var ajaxOptions = {};
                        var crs = projection.getCode();
                        var version = options.version || '1.1.0';
                        var url = serviceUrl;
                        var featureType = $.isArray(options.featureType) ? options.featureType : [options.featureType];
                        if (!options.properties || (options.properties instanceof Array && !options.properties.length) || !(Object.keys(options.properties).length)) {
                            url = url + '?service=WFS&' +
                                'version=' + version + '&request=GetFeature&typename=' + featureType.join(',') + '&' +
                                'outputFormat=' + mimeType + '&srsname=' + crs;
                            if (extent[0] !== -Infinity && extent[1] !== -Infinity && extent[2] !== Infinity && extent[3] !== Infinity) {
                                url = url + '&bbox=' + extent.join(',') + ',' + crs;
                            }

                            if (options.maxFeatures)
                                url = url + "maxFeatures=" + options.maxFeatures;
                        }
                        else {
                            ajaxOptions.method = 'POST';
                            switch (mimeType) {
                                case 'json':
                                    ajaxOptions.responseType = TC.Consts.mimeType.JSON;
                                    break;
                                default:
                                    ajaxOptions.responseType = TC.Consts.mimeType.XML;
                                    break;

                            }
                            //ajaxOptions.contentType = TC.Consts.mimeType.XML;
                            //ajaxOptions.processData = false;
                            //var formatter = new ol.format.WFS();
                            //var doc = formatter.writeGetFeature({
                            //    featureNS: 'wfs',
                            //    featurePrefix: 'feature',
                            //    featureTypes: featureType,
                            //    srsName: crs
                            //});
                            //var filter = [];
                            //filter[0] = '<ogc:Filter xmlns:ogc="http://www.opengis.net/ogc">';
                            //if (options.properties.length > 1) {
                            //    filter[filter.length] = '<ogc:And>';
                            //}
                            //for (var j = 0; j < options.properties.length; j++) {
                            //    var prop = options.properties[j];
                            //    filter[filter.length] = '<ogc:PropertyIsEqualTo matchCase="true"><ogc:PropertyName>';
                            //    filter[filter.length] = prop.name;
                            //    filter[filter.length] = '</ogc:PropertyName><ogc:Literal>';
                            //    filter[filter.length] = prop.value;
                            //    filter[filter.length] = '</ogc:Literal></ogc:PropertyIsEqualTo>';
                            //}
                            //if (options.properties.length > 1) {
                            //    filter[filter.length] = '</ogc:And>';
                            //}
                            //filter[filter.length] = '</ogc:Filter>';
                            //filter = filter.join('');
                            //var $doc = $(doc);
                            //$doc.find('Query').each(function (idx, query) {
                            //    $(query).html(filter);
                            //});
                            //ajaxOptions.data = $('<div>').append($doc).html();
                            var gml = [];
                            gml[gml.length] = '<wfs:GetFeature xmlns:wfs="http://www.opengis.net/wfs" service="WFS" version="';
                            gml[gml.length] = version;
                            gml[gml.length] = '" outputFormat="';
                            gml[gml.length] = options.outputFormat;
                            if (options.maxFeatures) {
                                gml[gml.length] = '" maxFeatures="';
                                gml[gml.length] = options.maxFeatures;
                            }
                            gml[gml.length] = '" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.opengis.net/wfs http://schemas.opengis.net/wfs/';
                            gml[gml.length] = version;
                            gml[gml.length] = '/wfs.xsd">';
                            for (var i = 0; i < featureType.length; i++) {
                                gml[gml.length] = '<wfs:Query typeName="feature:';
                                gml[gml.length] = featureType[i];
                                gml[gml.length] = '" srsName="';
                                gml[gml.length] = crs;
                                gml[gml.length] = '">';
                                if (options.propertynames) {
                                    var pPrefix = version === '1.1.0' ? 'wfs' : 'ogc';
                                    var _arrProperties = typeof (options.propertynames) === "string" ? options.propertynames.split(",") : options.propertynames
                                    if (options.geometryName)
                                        _arrProperties.push(options.geometryName)
                                    for (var i; i < _arrProperties.length; i++) {
                                        gml[gml.length] = '<' + pPrefix + ':PropertyName>' + _arrProperties[i].trim() + '</' + pPrefix + ':PropertyName>';
                                    }
                                }
                                gml[gml.length] = options.properties.getText();
                                gml[gml.length] = '</wfs:Query>';
                            }
                            gml[gml.length] = '</wfs:GetFeature>';

                            ajaxOptions.data = gml.join('');
                            ajaxOptions.contentType = TC.Consts.mimeType.XML;
                        }
                        ajaxOptions.url = url;
                        self._requestUrl = url;
                        TC.ajax(ajaxOptions).then(function (data) {
                            const feats = outputFormat.readFeatures(data);
                            const triggerLayerUpdate = function () {
                                self.parent.map.trigger(TC.Consts.event.LAYERUPDATE, {
                                    layer: self.parent, newData: data
                                });
                            };
                            const onFeaturesAdd = function (e) {
                                if (e.layer === self.parent) {
                                    self.parent.map.off(TC.Consts.event.FEATURESADD, onFeaturesAdd);
                                    triggerLayerUpdate();
                                }
                            };
                            if (feats.length) {
                                sOrigin.addFeatures(feats);
                                self.parent.map.on(TC.Consts.event.FEATURESADD, onFeaturesAdd);
                            }
                            else {
                                triggerLayerUpdate();
                            }
                            self.parent.state = TC.Layer.state.IDLE;
                        });
                    }
                },
                //strategy: ol.loadingstrategy.all(),
                projection: options.crs
            };
        }

        source = new ol.source.Vector(vectorOptions);

        if (usesGenericLoader) {
            source.on(ol.events.EventType.CHANGE, function (e) {
                if (self.parent.map) {
                    self.parent.map.trigger(TC.Consts.event.LAYERUPDATE, {
                        layer: self.parent
                    });
                }
            });
        }

        source._tcLayer = self.parent;

        var markerStyle = options.style && options.style.marker ? options.style.marker : TC.Cfg.styles.marker;
        if (!options.style || !options.style.marker) {
            markerStyle = $.extend({}, markerStyle, {
                anchor: TC.Cfg.styles.point.anchor
            });
        }

        // Si habilitamos el clustering la fuente es especial
        if (options.cluster) {
            source = new ol.source.Cluster({
                projection: options.crs,
                distance: options.cluster.distance,
                source: source
            });

            // Animación
            if (options.cluster.animate) {
                var getCurrentCoordinates = function (fromCoords, toCoords, duration, start) {
                    var fraction = Math.min((Date.now() - start) / duration, 1);
                    var dx = (toCoords[0] - fromCoords[0]) * fraction;
                    var dy = (toCoords[1] - fromCoords[1]) * fraction;
                    return [fromCoords[0] + dx, fromCoords[1] + dy];
                };
                var animate = function (parent, child) {
                    var start = Date.now();
                    var pCoords = parent.getGeometry().getCoordinates();
                    var cCoords = child.getGeometry().getCoordinates();
                    child.setGeometry(new ol.geom.Point(pCoords));
                    var step = function step() {
                        var coords = getCurrentCoordinates(pCoords, cCoords, TC.Consts.CLUSTER_ANIMATION_DURATION, start);
                        child.setGeometry(new ol.geom.Point(coords));
                        if (coords[0] !== cCoords[0] && coords[1] !== cCoords[1]) {
                            requestAnimationFrame(step);
                        }
                        else {
                            clusterCache.splice($.inArray(parent, clusterCache), 1);
                        }
                    };
                    requestAnimationFrame(step);
                };
                var clusterCache = [];
                source.addEventListener(ol.source.VectorEventType.REMOVEFEATURE, function (e) {
                    var features = e.feature.get('features');
                    if (features && features.length > 1) {
                        clusterCache.push(e.feature);
                    }
                });
                source.addEventListener(ol.source.VectorEventType.ADDFEATURE, function (e) {
                    var features = e.feature.get('features');
                    if (features) {
                        var coords = features[0].getGeometry().getCoordinates();
                        if (features.length > 1) {
                            var match = $.grep(clusterCache, function (elm) {
                                var elmCoords = elm.getGeometry().getCoordinates();
                                return elmCoords[0] === coords[0] && elmCoords[1] === coords[1];
                            });
                            if (match.length) {
                                clusterCache.splice($.inArray(match[0], clusterCache), 1);
                            }
                        }
                        var parent = $.grep(clusterCache, function (elm) {
                            var children = elm.get('features');
                            if (children && children.length > 0) {
                                var child = $.grep(children, function (cElm) {
                                    var cCoords = cElm.getGeometry().getCoordinates();
                                    return cCoords[0] === coords[0] && cCoords[1] === coords[1];
                                });
                                return child.length > 0;
                            }
                        });
                        if (parent.length) {
                            animate(parent[parent.length - 1], e.feature);
                        }
                    }
                });
            }
        }

        var s = source;
        do {
            s.addEventListener(ol.source.VectorEventType.ADDFEATURE, function (e) {
                var olFeat = e.feature;
                // OL3 dibuja el tamaño original del icono del marcador, lo escalamos si es necesario:
                var style = getNativeStyle(olFeat);
                if (style) {
                    setScaleFunction(style.getImage(), markerStyle.width, olFeat);
                }
            });
            if ($.isFunction(s.getSource)) {
                s = s.getSource();
            }
            else {
                s = null;
            }
        }
        while (s);

        source.addEventListener(ol.source.VectorEventType.ADDFEATURE, function (e) {
            const olFeat = e.feature;

            const addFeatureToLayer = function (feat) {
                var addFn;
                switch (true) {
                    case TC.feature.Point && feat instanceof TC.feature.Point:
                        addFn = self.parent.addPoint;
                        break;
                    case TC.feature.Polyline && feat instanceof TC.feature.Polyline:
                        addFn = self.parent.addPolyline;
                        break;
                    case TC.feature.Polygon && feat instanceof TC.feature.Polygon:
                        addFn = self.parent.addPolygon;
                        break;
                    case TC.feature.MultiPolygon && feat instanceof TC.feature.MultiPolygon:
                        addFn = self.parent.addMultiPolygon;
                        break;
                    case TC.feature.MultiPolyline && feat instanceof TC.feature.MultiPolyline:
                        addFn = self.parent.addMultiPolyline;
                        break;
                    default:
                        addFn = self.parent.addFeature;
                        break;
                }
                if (addFn) {
                    var _timeout;
                    addFn.call(self.parent, olFeat).then(function (f) {
                        var features = olFeat.get('features');
                        if ($.isArray(features)) {
                            // Es una feature de fuente ol.source.Cluster
                            f.features = $.map(features, function (elm) {
                                return new feat.constructor(elm);
                            });
                        }

                        // Timeout porque OL3 no tiene evento featuresadded. El timeout evita ejecuciones a lo tonto.
                        clearTimeout(_timeout);
                        _timeout = setTimeout(function () {
                            self.parent.map.trigger(TC.Consts.event.FEATURESADD, {
                                layer: self.parent, features: [f]
                            });
                        }, 50);
                    });
                }
            };

            if (!olFeat._wrap || !olFeat._wrap.parent.layer) { // Solo actuar si no es una feature añadida desde la API
                createFeatureFromNative(olFeat).then(addFeatureToLayer);
            }
        });

        source.addEventListener(ol.source.VectorEventType.REMOVEFEATURE, function (e) {
            var olFeat = e.feature;
            if (olFeat._wrap) {
                var idx = $.inArray(olFeat._wrap.parent, self.parent.features);
                if (idx > -1) {
                    self.parent.features.splice(idx, 1);
                    self.parent.map.trigger(TC.Consts.event.FEATUREREMOVE, {
                        layer: self.parent, feature: olFeat._wrap.parent
                    });
                }
            }
        });

        source.addEventListener(ol.source.VectorEventType.ADDFEATURE, function (e) {
            if (self.parent.map) {
                self.parent.map.trigger(TC.Consts.event.VECTORUPDATE, {
                    layer: self.parent
                });
            }
        });

        source.addEventListener(ol.source.VectorEventType.REMOVEFEATURE, function () {
            if (self.parent.map) {
                self.parent.map.trigger(TC.Consts.event.VECTORUPDATE, {
                    layer: self.parent
                });
            }
        });

        source.addEventListener(ol.source.VectorEventType.CLEAR, function () {
            if (self.parent.map) {
                self.parent.map.trigger(TC.Consts.event.FEATURESCLEAR, {
                    layer: self.parent
                });
            }
        });

        var layerOptions = {
            source: source
        };

        if (options.minResolution) {
            layerOptions.minResolution = options.minResolution;
        }
        if (options.maxResolution) {
            layerOptions.maxResolution = options.maxResolution;
        }

        // En KML conservamos el estilo que viene con el archivo, así que no entramos aquí.
        // A no ser que tenga clusters, porque OL no soporta por defecto la combinación de estilo KML con clusters.
        if (!(vectorOptions && vectorOptions.format instanceof ol.format.KML) || options.cluster) {
            layerOptions.style = nativeStyle || options.styles;
        }

        return layerOptions;
    };

    TC.wrap.layer.Vector.prototype.createStyles = function (options) {
        var self = this;

        var dynamicStyle = false;

        if ($.isFunction(options)) {
            dynamicStyle = true;
            self.styleFunction = function (olFeat) {
                return createNativeStyle(options(olFeat));
            }
        }
        else {
            options = $.extend({}, options);
            options.crs = options.crs || TC.Cfg.crs;
            options.styles = options.styles || TC.Cfg.styles;
            var isDynamicStyle = function isDynamicStyle(obj) {
                for (var key in obj) {
                    var prop = obj[key];
                    switch (typeof prop) {
                        case 'string':
                            if (/^\$\{(.+)\}$/.test(prop)) {
                                return true;
                            }
                            break;
                        case 'object':
                            if (isDynamicStyle(prop)) {
                                return true;
                            }
                            break;
                        case 'function':
                            return true;
                            break;
                        default:
                            break;
                    }
                }
                return false;
            };

            dynamicStyle = !!(options.cluster && options.cluster.styles) || isDynamicStyle(options.styles);
            self.styleFunction = function (olFeat) {
                return createNativeStyle(self.parent.options, olFeat);
            };
        }

        var nativeStyle = dynamicStyle ? self.styleFunction : self.styleFunction();

        return nativeStyle;
    };

    TC.wrap.layer.Vector.prototype.setStyles = function (options) {
        const self = this;
        self.getLayer().then(function (olLayer) {
            olLayer.setStyle(self.createStyles(options));
        });
    };

    TC.wrap.layer.Vector.prototype.createVectorLayer = function () {
        const self = this;
        var result = null;

        var options = self.parent.options;

        var layerOptions = self.createVectorSource(options, self.createStyles(options));
        layerOptions.declutter = self.parent.options.declutter || false;
        result = new ol.layer.Vector(layerOptions);
        result._wrap = self;

        self.addCommonEvents(result);

        return result;
    };

    TC.wrap.layer.Vector.prototype.addFeatures = function (features) {
        const self = this;
        const commit = function (l) {
            var source = l;
            while ($.isFunction(source.getSource)) {
                source = source.getSource();
            }
            source.addFeatures(features);
        };
        if (self.layer) {
            commit(self.layer);
        }
        else {
            self.getLayer().then(commit);
        }
    };

    TC.wrap.layer.Vector.prototype.getFeatures = function () {
        var olLayer = this.getLayer();
        if (olLayer instanceof ol.layer.Layer) {
            return olLayer.getSource().getFeatures();
        }
        else {
            return [];
        }
    };

    TC.wrap.layer.Vector.prototype.getFeatureById = function (id) {
        var olLayer = this.layer;
        if (olLayer instanceof ol.layer.Layer) {
            return olLayer.getSource().getFeatureById(id);
        }
        else {
            return null;
        }
    };

    TC.wrap.layer.Vector.prototype.removeFeature = function (feature) {
        const self = this;
        const commit = function (l) {
            if (feature.wrap.feature) {
                var source = l.getSource();
                source.removeFeature(feature.wrap.feature);
            }
        };
        if (self.layer) {
            commit(self.layer);
        }
        else {
            self.getLayer().then(commit);
        }
    };

    TC.wrap.layer.Vector.prototype.clearFeatures = function () {
        const self = this;
        const commit = function (l) {
            var source = l.getSource();
            if (source.clearFeatures) {
                source.clearFeatures();
            }
            else {
                source.clear();
            }
        };
        if (self.layer) {
            commit(self.layer);
        }
        else {
            self.getLayer().then(commit);
        }
    };

    TC.wrap.layer.Vector.prototype.setFeatureVisibility = function (feature, visible) {
        var self = this;

        var fillOptions = {
            color: 'rgba(0, 0, 0, 0)'
        };
        var strokeOptions = {
            color: 'rgba(0, 0, 0, 0)'
        };
        var displayNoneStyle = new ol.style.Style({
            image: new ol.style.Circle({
                radius: 0,
                fill: new ol.style.Fill(fillOptions),
                stroke: new ol.style.Stroke(strokeOptions)
            }),
            fill: new ol.style.Fill(fillOptions),
            stroke: new ol.style.Stroke(strokeOptions)
        });
        var idx = $.inArray(feature, self.parent.features);
        if (idx >= 0) {
            var olFeat = feature.wrap.feature;
            self.getLayer().then(function (olLayer) {
                if (visible && olFeat._originalStyle) {
                    olFeat.setStyle(olFeat._originalStyle);
                }
                else {
                    olFeat._originalStyle = olFeat.getStyle() || olLayer.getStyle();
                    olFeat.setStyle(displayNoneStyle);
                }
                self.parent.map.trigger(TC.Consts.event.VECTORUPDATE, {
                    layer: self.parent
                });
            });
        }
    };

    TC.wrap.layer.Vector.prototype.getRGBA = function (color, opacity) {
        return getRGBA(color, opacity);
    };

    TC.wrap.layer.Vector.prototype.findFeature = function (values) {
        // TODO: añadir ol.animation.zoom
    };

    TC.wrap.layer.Vector.prototype.getGetFeatureUrl = function () {
        return this._requestUrl;
    };

    TC.wrap.layer.Vector.prototype.getDescribeFeatureTypeUrl = function () {
        var self = this;
        var layer = self.parent;
        var version = layer.options.version || '1.1.0';
        var url = layer.url;
        var featureType = $.isArray(layer.options.featureType) ? layer.options.featureType : [layer.options.featureType];
        url = url + '?service=WFS&' + 'version=' + version + '&request=DescribeFeatureType&typename=' + featureType.join(',') + '&outputFormat=XMLSCHEMA';
        return url;
    };

    TC.wrap.layer.Vector.prototype.sendTransaction = function (inserts, updates, deletes) {
        const self = this;
        const getNativeFeature = function (feat) {
            return feat.wrap.feature;
        };
        return new Promise(function (resolve, reject) {
            const olInserts = inserts.map(getNativeFeature);
            const olUpdates = updates.map(getNativeFeature);
            const olDeletes = deletes.map(getNativeFeature);
            if (inserts.length || updates.length || deletes.length) {
                self.getLayer().then(function (olLayer) {
                    var source = olLayer.getSource();
                    var format = new ol.format.WFS();
                    var options = self.parent.options;
                    var transaction = format.writeTransaction(olInserts, olUpdates, olDeletes, {
                        featurePrefix: options.featurePrefix,
                        featureNS: options.featureNS,
                        featureType: options.featureType[0]
                    });
                    var ajaxOptions = {
                        url: self.parent.url,
                        method: 'POST',
                        responseType: TC.Consts.mimeType.XML,
                        data: transaction.outerHTML
                    };
                    TC.ajax(ajaxOptions)
                        .then(function (data) {
                            var er = data.getElementsByTagName('ExceptionReport')[0];
                            var errorObj = {
                                reason: ''
                            };
                            if (er) {
                                var e = er.getElementsByTagName('Exception')[0];
                                if (e) {
                                    errorObj.code = e.getAttribute('exceptionCode');
                                    var texts = e.getElementsByTagName('ExceptionText');
                                    for (var i = 0, len = texts.length; i < len; i++) {
                                        errorObj.reason += '\n' + texts[i].innerHTML;
                                    }
                                }
                                reject(errorObj);
                            }
                            else {
                                var response = format.readTransactionResponse(data);
                                resolve(response);
                            }
                        })
                        .catch(function () {
                            reject({
                                code: '', reason: 'unknown'
                            });
                        });
                });
            }
            else {
                resolve(self.parent);
            }
        });
    };

    TC.wrap.layer.Vector.prototype.setDraggable = function (draggable, onend, onstart) {
        var self = this;

        //tiene que estar a nivel de control para poder retirarla después
        //var interaction;
        Promise.all([self.parent.map.wrap.getMap(), self.getLayer()]).then(function (olObjects) {
            const olMap = olObjects[0];
            const olLayer = olObjects[1];
            if (draggable) {
                var interactionOptions = {
                    layers: [olLayer],
                    features: new ol.Collection(olLayer.getSource().getFeatures())
                };
                self.interaction = new ol.interaction.Translate(interactionOptions);
                if ($.isFunction(onend)) {
                    self.interaction.on(ol.interaction.TranslateEventType.TRANSLATEEND, function (e) {
                        if (e.features.getLength()) {
                            onend(e.features.item(0)._wrap.parent);
                        }
                    });
                }
                if ($.isFunction(onstart)) {
                    self.interaction.on(ol.interaction.TranslateEventType.TRANSLATESTART, function (e) {
                        if (e.features.getLength()) {
                            onstart(e.features.item(0)._wrap.parent);
                        }
                    });
                }
                olMap.addInteraction(self.interaction);

                // GLS: En IE no muestra la manita en el over sobre marcadores trasladables.
                if (TC.Util.detectIE()) {
                    self._handlerDraggablePointerMove = function (e) {
                        if (e.dragging) {
                            return;
                        }

                        var pixel = olMap.getEventPixel(e);
                        var hit = olMap.hasFeatureAtPixel(pixel);
                        if (hit) {
                            olMap.forEachFeatureAtPixel(pixel, function (feature, layer) {
                                if (layer._wrap && layer._wrap.parent && layer._wrap.parent.id === self.parent.id && feature) {
                                    olMap.getTarget().style.cursor = 'move';
                                } else {
                                    olMap.getTarget().style.cursor = '';
                                }
                            },
                                {
                                    hitTolerance: hitTolerance
                                });
                        } else {
                            olMap.getTarget().style.cursor = '';
                        }
                    };

                    olMap.on('pointermove', self._handlerDraggablePointerMove);
                }
            }
            else if (self.interaction) {
                olMap.removeInteraction(self.interaction);

                // GLS: En IE no muestra la manita en el over sobre marcadores trasladables.
                if (TC.Util.detectIE() && self._handlerDraggablePointerMove && $.isFunction(self._handlerDraggablePointerMove)) {
                    olMap.un('pointermove', self._handlerDraggablePointerMove);
                    delete self._handlerDraggablePointerMove;
                }
            }
        });
    };

    TC.wrap.layer.Vector.prototype.getFeaturesInExtent = function (extent, tolerance) {
        var self = this;
        var features = this.layer.getSource().getFeatures();
        var featuresInExtent = [];

        if (tolerance) {
            var leftCorner = self.parent.map.getPixelFromCoordinate([extent[0], extent[1]]);
            var rightCorner = self.parent.map.getPixelFromCoordinate([extent[2], extent[3]]);
            leftCorner[0] -= tolerance[0] / 2;
            leftCorner[1] += tolerance[1];
            rightCorner[0] += tolerance[0] / 2;
            extent = self.parent.map.getCoordinateFromPixel(leftCorner).concat(self.parent.map.getCoordinateFromPixel(rightCorner));
        }

        for (var i = 0; i < features.length; i++) {
            var feat = features[i];

            var geometry = feat.getGeometry();
            var coordinate = geometry.getCoordinates();

            if (ol.extent.containsCoordinate(extent, coordinate)) {
                featuresInExtent.push(feat._wrap.parent);
            }
        }

        return featuresInExtent;
    };

    TC.wrap.layer.Vector.prototype.getAttribution = function () {
        return null;
    };

    TC.wrap.control.Click.prototype.register = function (map) {
        var self = this;

        self._trigger = function (e) {
            if (map.view === TC.Consts.view.PRINTING) {
                return;
            }
            var featureCount = 0;
            map.wrap.map.forEachFeatureAtPixel(e.pixel,
                function (feature, layer) {
                    if (feature._wrap && feature._wrap.parent.showsPopup) {
                        featureCount++;
                    }
                },
                {
                    hitTolerance: hitTolerance
                });
            if (!featureCount) {
                // GLS: lanzo el evento click, para que los controles que no pueden heredar de click y definir un callback pueda suscribirse al evento
                self.parent.map.trigger(TC.Consts.event.CLICK, {
                    coordinate: e.coordinate, pixel: e.pixel
                });
                self.parent.callback(e.coordinate, e.pixel);
            }
            // Seguimos adelante si no se han pinchado featuers
            return featureCount === 0;
        };
    };

    TC.wrap.control.Click.prototype.activate = function () {
        var self = this;

        self.parent.map.wrap.getMap().then(function (olMap) {
            olMap.on(ol.MapBrowserEventType.SINGLECLICK, self._trigger);
        });
    };

    TC.wrap.control.Click.prototype.deactivate = function () {
        var self = this;

        self.parent.map.wrap.getMap().then(function (olMap) {
            olMap.un(ol.MapBrowserEventType.SINGLECLICK, self._trigger);
        });
    };

    TC.wrap.control.ScaleBar.prototype.render = function () {
        var self = this;
        if (!self.ctl) {
            self.ctl = new ol.control.ScaleLine({
                target: self.parent.div
            });
        }
        else {
            self.ctl.updateElement_();
        }
    };

    TC.wrap.control.ScaleBar.prototype.getText = function () {
        var self = this;
        if (self.ctl) {
            return self.ctl.renderedHTML_;
        }
    };

    TC.wrap.control.NavBar.prototype.register = function (map) {
        var self = this;
        map.wrap.getMap().then(function (olMap) {
            const div = self.parent.div;
            self.zCtl = new ol.control.Zoom({
                target: div
            });
            // Ponemos para render una función modificada, para evitar que en los pinch zoom haya errores de este tipo:
            // AssertionError: Assertion failed: calculated value (1.002067782531452) ouside allowed range (0-1)

            self.zsCtl = new ol.control.ZoomSlider({
                render: function (e) {
                    if (!e.frameState || !e.frameState.viewState || olMap.getView().getMinResolution() <= e.frameState.viewState.resolution) {
                        // GLS: para evitar que el slider se configure en horizontal
                        var render = function () {
                            if (this.element.offsetWidth > this.element.offsetHeight) {
                                if (!self.requestSliderSize) {
                                    self.requestSliderSize = window.requestAnimationFrame(render.bind(this));
                                }

                                window.requestAnimationFrame(render.bind(this));
                            } else if (this.element.offsetWidth < this.element.offsetHeight) {
                                if (self.requestSliderSize) {
                                    window.cancelAnimationFrame(self.requestSliderSize);
                                    delete self.requestSliderSize;
                                }
                                ol.control.ZoomSlider.render.call(this, e);
                            }
                        };
                        render.call(this);
                    }
                }
            });
            self.zsCtl.setTarget(div);

            olMap.addControl(self.zsCtl);
            olMap.addControl(self.zCtl);

            div.querySelectorAll('button').forEach(function (button) {
                button.classList.add('tc-ctl-btn');
                button.classList.add(self.parent.CLASS + '-btn');
                button.style.display = 'block';
                button.innerHTML = '';
                if (button.matches('.ol-zoom-in')) {
                    button.classList.add(self.parent.CLASS + '-btn-zoomin');
                    button.setAttribute('title', self.parent.getLocaleString('zoomIn'));
                }
                if (button.matches('.ol-zoom-out')) {
                    button.classList.add(self.parent.CLASS + '-btn-zoomout');
                    button.setAttribute('title', self.parent.getLocaleString('zoomOut'));
                }
            });

            const zoomSlider = div.querySelector('.ol-zoomslider');
            zoomSlider.classList.add(self.parent.CLASS + '-bar');
            zoomSlider.querySelector('.ol-zoomslider-thumb').classList.add(self.parent.CLASS + '-slider');

            map.on(TC.Consts.event.BASELAYERCHANGE, $.proxy(self.refresh, self));
        });
    };

    TC.wrap.control.NavBar.prototype.refresh = function () {
        /*
        var map = this.parent.map;
        var olMap = map.wrap.map;

        olMap.removeControl(self.zsCtl);
        var res = map.getResolutions();
        self.zsCtl = new ol.control.ZoomSlider(
            {
                target: this.parent.div,
                "maxResolution": res[0],
                "minResolution": res[res.length - 1]
            });

        olMap.addControl(self.zsCtl);
        $(map.div).find('.ol-zoomslider').addClass(self.parent.CLASS + '-bar').find('.ol-zoomslider-thumb').addClass(self.parent.CLASS + '-slider');
        */
        var self = this;
        var map = self.parent.map.wrap.map;
        // Puede ser que se llame a refresh antes de que esté inicializado ol.control.ZoomSlider. En ese caso llamamos a render que lo inicializa.
        // Como render necesita un ol.MapEvent, esperamos al evento POSTRENDER.

        self.parent.renderPromise().then(function () {
            if (self.zsCtl.sliderInitialized_) {
                var res = map.getView().getResolution();
                self.zsCtl.setThumbPosition_(res);
            }
            else {
                map.once(ol.MapEventType.POSTRENDER, function (e) {
                    self.zsCtl.render(e);
                });
            }
        });
    };

    TC.wrap.control.NavBarHome.prototype.register = function (map) {
        var self = this;
        map.wrap.getMap().then(function (olMap) {
            const div = self.parent.div;

            self.z2eCtl = new ol.control.ZoomToExtent({
                target: div, extent: map.initialExtent, tipLabel: ''
            });

            olMap.addControl(self.z2eCtl);

            div.querySelectorAll('button').forEach(function(button) {
                button.style.display = 'block';
                button.innerHTML = '';
            });
            const homeBtn = div.querySelector('.ol-zoom-extent button');
            homeBtn.classList.add('tc-ctl-btn');
            homeBtn.classList.add(self.parent.CLASS + '-btn');
            homeBtn.setAttribute('title', self.parent.getLocaleString('zoomToInitialExtent'));
        });
    };

    TC.wrap.control.NavBarHome.prototype.setInitialExtent = function (extent) {
        this.z2eCtl.extent = extent;
    };

    TC.wrap.control.Coordinates.prototype.register = function (map) {
        const self = this;
        self.map = map;

        return new Promise(function (resolve, reject) {

            self._coordsTrigger = function (e) {
                self.parent.coordsToClick(e);
            };

            map.wrap.getMap().then(function (olMap) {
                self.olMap = olMap;

                if (!self.parent.map.on3DView) {
                    var projection = olMap.getView().getProjection();
                    self.parent.crs = projection.getCode();
                    self.parent.units = projection.getUnits();
                } else {
                    self.parent.crs = self.parent.map.view3D.crs;
                    self.parent.units = TC.Consts.units.DEGREES;
                }

                self.parent.isGeo = self.parent.units === ol.proj.Units.DEGREES;

                //$(olMap.getViewport()).add(self.parent.div);
                resolve();
            });
        });
    };

    TC.wrap.control.Coordinates.prototype.onMouseMove = function (e) {
        var self = this;
        if (self.map.wrap.map) {
            var coords = self.map.wrap.map.getEventCoordinate(e);
            if (coords) {
                if (self.parent.isGeo) {
                    self.parent.latLon = coords.reverse();
                } else {
                    self.parent.xy = coords;
                }

                self.parent.update.apply(self.parent, arguments);
            }
        }
    };

    TC.wrap.control.Geolocation.prototype.register = function (map) {
        var self = this;
        self.map = map;

        self._snapTrigger = function (e) {
            if (e.dragging)
                return;

            self.initSnap(self.olMap.getEventCoordinate(e), e.pixel);
        };

        self._postcomposeTrigger = function (e) {
            self.duringTrackSnap(e);
        };

        map.wrap.getMap().then(function (olMap) {
            self.olMap = olMap;
        });
    };

    var getTrackingLine = function () {
        var self = this;

        return self.parent.layerTracking.features.filter(function (f) {
            return f instanceof TC.feature.Polyline;
        })[0];
    }

    TC.wrap.control.Geolocation.prototype.hasCoordinates = function () {
        var self = this;

        return self.parent.layerTracking.features.length > 0 && self.parent.layerTracking.features[0].geometry.length >= 1;
    };

    var getTime = function (timeFrom, timeTo) {
        var diff = timeTo - timeFrom;
        var d = {
            s: Math.floor((diff / 1000) % 60),
            m: Math.floor(((diff / (1000 * 60)) % 60)),
            h: Math.floor(((diff / (1000 * 60 * 60)) % 24))
        };

        return $.extend({}, d, { toString: ("00000" + d.h).slice(-2) + ':' + ("00000" + d.m).slice(-2) + ':' + ("00000" + d.s).slice(-2) });
    };
    TC.wrap.control.Geolocation.prototype.showElevationMarker = function (d) {
        var self = this;

        TC.wrap.control.ResultsPanel.prototype.showElevationMarker.call(self, {
            data: d,
            layer: self.parent.layerTrack,
            coords: self.parent.chart.coordinates
        })
    };

    TC.wrap.control.Geolocation.prototype.hideElevationMarker = function () {
        TC.wrap.control.ResultsPanel.prototype.hideElevationMarker.call(this);
    };

    TC.wrap.control.Geolocation.prototype.addWaypoint = function (position, properties) {
        var self = this;

        var waypoint = new ol.Feature({
            geometry: new ol.geom.Point([position[0], position[1], properties.ele, properties.time], ('XYZM'))
        });
        waypoint.setProperties(properties);

        self.parent.layerTracking.wrap.layer.getSource().addFeature(waypoint);
    };

    TC.wrap.control.Geolocation.prototype.addPosition = function (position, heading, m, speed, accuracy, altitudeAccuracy, altitude) {
        var self = this;

        var x = Math.round(position[0]);
        var y = Math.round(position[1]);

        var line = getTrackingLine.call(this);
        if (self.parent.layerTracking.features && line) {
            var last = line.geometry.length > 0 && line.geometry[line.geometry.length - 1];
            if (last && last.length == 0) {
                self.parent.layerTracking.features[0].geometry.push([x, y, altitude, m]);
                line.wrap.feature.getGeometry().appendCoordinate([x, y, altitude, m]);
            }
            else {
                var lx = Math.round(last[0]);
                var ly = Math.round(last[1]);

                if (x != lx || y != ly) {
                    self.parent.layerTracking.features[0].geometry.push([x, y, altitude, m]);
                    line.wrap.feature.getGeometry().appendCoordinate([x, y, altitude, m]);
                }
            }

            TC.Util.storage.setSessionLocalValue(self.parent.Const.LocalStorageKey.TRACKINGTEMP, self.formattedToStorage(self.parent.layerTracking).features);
        }

        self.parent.trigger(self.parent.Const.Event.STATEUPDATED, {
            moving: (heading != undefined && speed != undefined && speed > 0 && heading > 0)
        });
    };

    TC.wrap.control.Geolocation.prototype.positionChangehandler = function (geoposition) {
        const self = this;
        var accuracy, heading, speed, altitude, altitudeAccuracy;

        if (!getTrackingLine.call(this)) {
            self.setTracking(false);
        }

        return new Promise(function (resolve, reject) {
            if (geoposition && geoposition.coords) {
                self.parent.layerGPS.clearFeatures();

                accuracy = (geoposition.coords.accuracy / self.parent.map.getMetersPerUnit()) || 0;
                heading = geoposition.coords.heading || geoposition[2] || 0;
                speed = geoposition.coords.speed ? geoposition.coords.speed * 3.6 : 0;
                altitude = geoposition.coords.altitude || 0;
                altitudeAccuracy = geoposition.coords.altitudeAccuracy || 0;

                if (self.parent.layerTracking) {
                    var position_ = [geoposition.coords && geoposition.coords.longitude || geoposition[0], geoposition.coords && geoposition.coords.latitude || geoposition[1]];
                    var projectedPosition = TC.Util.reproject(position_, 'EPSG:4326', self.parent.map.crs);

                    self.addPosition(projectedPosition, heading, new Date().getTime(), speed, accuracy, altitudeAccuracy, altitude);

                    var coords = getTrackingLine.call(self).geometry;
                    var len = coords.length;
                    if (len >= 2) {
                        self.parent.deltaMean = (coords[len - 1][3] - coords[0][3]) / (len - 1);
                    }

                    self.parent.trigger(self.parent.Const.Event.POSITIONCHANGE, {
                        pd: {
                            "position": projectedPosition,
                            "altitude": altitude,
                            "accuracy": accuracy,
                            "heading": TC.Util.radToDeg(heading),
                            "speed": speed
                        }
                    });

                    Promise.all([self.parent.layerGPS.addPoint(projectedPosition, {
                        radius: 4,
                        fillColor: '#00CED1',
                        fillOpacity: 1,
                        strokeColor: '#ffffff',
                        strokeWidth: 2,
                        showsPopup: false
                    }), self.parent.layerGPS.addCircle([projectedPosition, accuracy], {
                        strokeColor: '#00CED1',
                        strokeWidth: 0.4,
                        fillColor: '#ffffff',
                        fillOpacity: 0.2,
                        showsPopup: false
                    })]).then(function (features) {
                        const marker = features[0];
                        const accuracyCircle = features[1];
                        self.parent.geopositionTracking = true;

                        if (self.parent.firstPosition == false) {
                            self.parent.firstPosition = true;

                            if (!self.parent.trackCenterButton) {
                                self.parent.trackCenterButton = self.parent.div.querySelector('.' + self.parent.CLASS + '-track-center');
                                self.parent.trackCenterButton.querySelector('button').addEventListener('click', function () {
                                    self.parent.layerGPS.map.zoomToFeatures(self.parent.layerGPS.features);

                                    if (!self.parent.track.infoPanel.isVisible()) {
                                        self.parent.track.infoPanel.doVisible();
                                    }

                                    if (self.parent.track.infoPanel.isMinimized()) {
                                        self.parent.track.infoPanel.maximize();
                                    }
                                });

                                var controlContainer = self.parent.map.getControlsByClass('TC.control.ControlContainer')[0];
                                if (controlContainer) {
                                    self.parent.trackCenterButton = controlContainer.addElement({ side: controlContainer.SIDE.LEFT, htmlElement: self.parent.trackCenterButton });
                                } else {
                                    self.parent.map.div.appendChild(self.parent.trackCenterButton);
                                }

                            }
                            self.parent.trackCenterButton.classList.remove(TC.Consts.classes.HIDDEN);

                            self.parent.layerGPS.map.zoomToFeatures(self.parent.layerGPS.features);
                        }

                        resolve({
                            marker: marker, accuracy: accuracyCircle
                        });
                    });

                } else { resolve(null); }
            } else {
                resolve(null);
            }
        });
    };

    TC.wrap.control.Geolocation.prototype.setTracking = function (tracking) {
        var self = this;

        if (tracking) {
            self.parent.firstPosition = false;
            var sessionwaypoint = [];

            var nativeTrackingFeature;

            if (self.parent.sessionTracking) {

                var JSONParser = new TC.wrap.parser.JSON();
                var features = JSONParser.parser.readFeatures(self.parent.sessionTracking);
                if (features && self.parent.storageCRS !== self.parent.map.crs) {
                    features = features.map(function (feature) {
                        var clone = feature.clone();
                        clone.getGeometry().transform(self.parent.storageCRS, self.parent.map.crs);
                        return clone;
                    });
                }

                var coordinates = features.filter(function (feature) {
                    var type = feature.getGeometry().getType().toLowerCase();
                    if (type === 'point') { sessionwaypoint.push(feature); }
                    return type === 'linestring' || type === 'multilinestring';
                })[0].getGeometry().getCoordinates();

                nativeTrackingFeature = new ol.Feature({
                    geometry: new ol.geom.LineString(coordinates, ('XYZM')),
                    tracking: true
                });

            } else {
                nativeTrackingFeature = new ol.Feature({
                    geometry: new ol.geom.LineString([], ('XYZM')),
                    tracking: true
                });
            }

            if (nativeTrackingFeature) {

                TC.wrap.Feature.createFeature(nativeTrackingFeature).then(function (tcFeature) {
                    self.parent.layerTracking.addFeature(tcFeature);

                    if (tcFeature.geometry.length > 1) {
                        self.parent.map.zoomToFeatures(self.parent.layerTracking.features);
                    }

                    if (sessionwaypoint.length > 0) {
                        Promise.all(sessionwaypoint.map(function (waypoint) {
                            return TC.wrap.Feature.createFeature(waypoint);
                        })).then(function (features) {
                            if (features) {
                                features.forEach(function (feature) {
                                    self.parent.layerTracking.addFeature(feature);
                                });
                            }
                        });
                    }

                    self.parent.currentPositionWaiting = self.parent.getLoadingIndicator().addWait();

                    if (!self.currentPositionTrk) {
                        self.currentPositionTrk = [];
                    }

                    var getCurrentPositionInterval;
                    var getCurrentPositionRequest = 0;
                    var errorTimeout = 0;
                    var toast = false;
                    var options = {
                        enableHighAccuracy: true, timeout: 600000
                    };

                    function getCurrentPosition(errorCallback) {
                        var id = getCurrentPositionRequest++;
                        navigator.geolocation.getCurrentPosition(
                            function (data) {
                                clearInterval(getCurrentPositionInterval);
                                self.parent.getLoadingIndicator().removeWait(self.parent.currentPositionWaiting);
                                self.positionChangehandler(data).then(function (obj) {
                                    if (self.parent.geopositionTracking == true && obj && obj.marker && obj.accuracy) {
                                        self.currentPositionTrk.push(navigator.geolocation.watchPosition(self.positionChangehandler.bind(self), self.parent.onGeolocateError.bind(self.parent), options));
                                    }
                                });
                            },
                            errorCallback ? errorCallback :
                                function (error) {
                                    switch (error.code) {
                                        case error.TIMEOUT:
                                            if (errorTimeout > 10) {
                                                clearInterval(getCurrentPositionInterval);
                                                self.parent.onGeolocateError.call(self.parent, error);
                                            } else {
                                                errorTimeout++;
                                                getCurrentPosition(function () {
                                                    clearInterval(getCurrentPositionInterval);
                                                    if (!toast) {
                                                        toast = true;
                                                        self.parent.onGeolocateError.call(self.parent, error);
                                                    }
                                                });
                                            }
                                            break;
                                        default:
                                            clearInterval(getCurrentPositionInterval);
                                            self.parent.onGeolocateError.call(self.parent, error);
                                    }
                                }, {
                                timeout: 5000 + id,
                                maximumAge: 10,
                                enableHighAccuracy: true
                            }
                        );
                    }
                    getCurrentPositionInterval = setInterval(getCurrentPosition, 1000);

                    setTimeout(function () {
                        if (self.parent.layerTracking && self.parent.layerTracking.features && self.parent.layerTracking.features.length > 0 && self.parent.layerTracking.features[0].geometry.length == 0) {
                            clearInterval(getCurrentPositionInterval);

                            self.parent.getLoadingIndicator().removeWait(self.parent.currentPositionWaiting);
                            self.map.toast(self.parent.getLocaleString("geo.error.permission_denied"), {
                                type: TC.Consts.msgType.WARNING
                            });
                            self.parent.track.activateButton.classList.remove(TC.Consts.classes.HIDDEN);
                            self.parent.track.deactivateButton.classList.add(TC.Consts.classes.HIDDEN);
                        }
                    }, options.timeout + 1000); // Wait extra second

                });
            }
        } else {
            self.parent.firstPosition = false;

            if (self.currentPositionTrk) {
                self.currentPositionTrk = self.currentPositionTrk instanceof Array ? self.currentPositionTrk : [self.currentPositionTrk];

                self.currentPositionTrk.forEach(function (watch) {
                    navigator.geolocation.clearWatch(watch);
                });

                self.currentPositionTrk = [];
            }

            if (self.parent.trackCenterButton)
                self.parent.trackCenterButton.classList.add(TC.Consts.classes.HIDDEN);
        }
    };

    TC.wrap.control.Geolocation.prototype.activateSnapping = function () {
        var self = this;

        if (!TC.Util.detectMobile()) {
            self.olMap.on([ol.MapBrowserEventType.POINTERMOVE, ol.MapBrowserEventType.SINGLECLICK], self._snapTrigger);
            self.olMap.on(ol.render.EventType.POSTCOMPOSE, self._postcomposeTrigger);
        }
    };
    TC.wrap.control.Geolocation.prototype.deactivateSnapping = function () {
        var self = this;

        self.parent.map.wrap.getMap().then(function (olMap) {
            if (!TC.Util.detectMobile()) {
                olMap.un([ol.MapBrowserEventType.POINTERMOVE, ol.MapBrowserEventType.SINGLECLICK], self._snapTrigger);
                olMap.un(ol.render.EventType.POSTCOMPOSE, self._postcomposeTrigger);
            }

            if (self.snapInfo) {
                olMap.removeOverlay(self.snapInfo);
            }

            if (self.snapInfoElement) {
                self.snapInfoElement.style.display = 'none';
            }

            if (self.snapLine) {
                delete self.snapLine;
                olMap.render();
            }
        });
    };
    TC.wrap.control.Geolocation.prototype.clear = function (layer) {
        var self = this;

        if (layer) {
            layer.clearFeatures();
        }

        attachedDTD = false;

        self.deactivateSnapping.call(self);
    };
    var vectorCtx;
    TC.wrap.control.Geolocation.prototype.duringTrackSnap = function (e) {
        var self = this;

        var vectorContext = vectorCtx = e.vectorContext;

        if (vectorContext && self.snapLine) {
            if (typeof (vectorContext.setFillStrokeStyle) === 'function')
                vectorContext.setFillStrokeStyle(null, new ol.style.Stroke({
                    color: 'rgba(197, 39, 55, 1)',
                    width: 1
                }));

            if (typeof (vectorContext.drawGeometry) === 'function')
                vectorContext.drawGeometry(self.snapLine.wrap.feature.getGeometry());
        }
    };

    TC.wrap.control.Geolocation.prototype.endSnap = function () {
        var self = this;

        self.parent.map.wrap.getMap().then(function (olMap) {
            /* cartel */
            if (self.snapInfo) {
                olMap.removeOverlay(self.snapInfo);
            }
            if (self.snapInfoElement) {
                self.snapInfoElement.style.display = 'none';
            }
            /* línea */
            if (self.snapLine) {
                delete self.snapLine;
            }
        });
    };

    TC.wrap.control.Geolocation.prototype.initSnap = function (coordinate, eventPixel) {
        var self = this;

        if (self.parent.layerTrack) {
            var vectorSource = self.parent.layerTrack.wrap.layer.getSource();
            var closestFeature = vectorSource.getClosestFeatureToCoordinate(coordinate);

            if (closestFeature !== null) {
                var geometry = closestFeature.getGeometry();
                var closestPoint = geometry.getClosestPoint(coordinate);

                const pixel = self.parent.map.getPixelFromCoordinate(closestPoint);
                const distance = Math.sqrt(
                    Math.pow(eventPixel[0] - pixel[0], 2) +
                    Math.pow(eventPixel[1] - pixel[1], 2));

                if (distance > self.parent.snappingTolerance) {
                    self.endSnap();
                } else {
                    var coordinates = [coordinate, [closestPoint[0], closestPoint[1]]];

                    if (!self.snapLine) self.snapLine = new TC.feature.Polyline(coordinates);
                    else self.snapLine.wrap.feature.getGeometry().setCoordinates(coordinates);

                    // información del punto
                    if (!self.snapInfoElement)
                        self.snapInfoElement = document.getElementsByClassName('tc-ctl-geolocation-track-snap-info')[0];

                    self.snapInfoElement.style.display = 'block';

                    if (!self.snapInfo) {
                        self.snapInfo = new ol.Overlay({
                            element: self.snapInfoElement,
                            offset: [5, 18]
                        });

                        self.olMap.addOverlay(self.snapInfo);
                    }

                    if (self.snapInfo.getMap() == undefined)
                        self.snapInfo.setMap(self.olMap);

                    self.snapInfo.setPosition(coordinate);

                    var data = {};
                    if (closestFeature.getGeometry().getType() != "LineString") {
                        if (closestFeature.getKeys().indexOf('name') > -1)
                            data.n = closestFeature.get('name');
                    }

                    var locale = self.parent.map.options.locale && self.parent.map.options.locale.replace('_', '-') || undefined;
                    data.x = self.map.wrap.isGeo() ? closestPoint[0].toLocaleString(locale, { minimumFractionDigits: 5 }) : Math.round(closestPoint[0]).toLocaleString(locale);
                    data.y = self.map.wrap.isGeo() ? closestPoint[1].toLocaleString(locale, { minimumFractionDigits: 5 }) : Math.round(closestPoint[1]).toLocaleString(locale);

                    if (self.map.wrap.isGeo()) {
                        data.isGeo = true;
                    }

                    var getZ = function (position) {
                        return closestPoint[position] ? (Math.round(closestPoint[position] * 100) / 100).toLocaleString(locale) : undefined;
                    };
                    var getM = function (position) {
                        return closestPoint[position] > 0 ? new Date(closestPoint[position]).toLocaleString(locale) : undefined;
                    };

                    if (closestFeature.getGeometry().getLayout() === ol.geom.GeometryLayout.XYZM) {
                        data.z = getZ(2);
                        data.m = getM(3);
                    } else if (closestFeature.getGeometry().getLayout() === ol.geom.GeometryLayout.XYZ) {
                        data.z = getZ(2);
                    } else if (closestFeature.getGeometry().getLayout() === ol.geom.GeometryLayout.XYM) {
                        data.m = getM(2);
                    }

                    if (data) {
                        self.parent.getRenderedHtml(self.parent.CLASS + '-track-snapping-node', data, function (html) {
                            self.snapInfoElement.innerHTML = html;
                        });
                    }
                }
            }
        }

        self.olMap.render();
    };

    TC.wrap.control.Geolocation.prototype.drawTrackingData = function (track) {
        const self = this;

        return new Promise(function (resolve, reject) {
            const featurePromises = [];

            const JSONParser = new TC.wrap.parser.JSON();
            const features = JSONParser.parser.readFeatures(track.data);

            features.filter(function (feature) {
                return feature.getGeometry().getType().toLowerCase() === 'linestring' || feature.getGeometry().getType().toLowerCase() === 'multilinestring';
            }).forEach(function (feature) {
                feature.getGeometry().setCoordinates(feature.getGeometry().getCoordinates(), track.layout);
            });

            self.activateSnapping.call(self);

            for (var i = 0, len = features.length; i < len; i++) {
                featurePromises.push(TC.wrap.Feature.createFeature(features[i]));
            }

            Promise.all(featurePromises).then(function (feats) {
                feats.forEach(function (feat) {
                    if (feat) {
                        self.parent.layerTrack.addFeature(feat);
                    }
                });
                self.parent.map.zoomToFeatures(self.parent.layerTrack.features);

                resolve();
            });
        });
    };

    TC.wrap.control.Geolocation.prototype.formattedFromStorage = function (storageData) {
        const self = this;

        if (self.parent.storageCRS !== self.parent.map.crs) {
            var features = new ol.format.GeoJSON().readFeatures(storageData);
            if (features) {
                features = features.map(function (feature) {
                    var clone = feature.clone();
                    clone.getGeometry().transform(self.parent.storageCRS, self.parent.map.crs);
                    return clone;
                });

                return new ol.format.GeoJSON().writeFeatures(features);
            }
        }

        return storageData;
    };
    TC.wrap.control.Geolocation.prototype.formattedToStorage = function (layer, removeTrackingProperty, notReproject) {
        var self = this;

        var parser = new TC.wrap.parser.JSON();
        parser = parser.parser;

        var features = layer.wrap.layer.getSource().getFeatures();
        var layout;

        features = features.map(function (feature) {
            if (feature.getGeometry() instanceof ol.geom.LineString) {
                layout = feature.getGeometry().getLayout();
            }

            if (removeTrackingProperty && feature.getProperties().tracking) {
                feature.unset("tracking");
            }

            if (!notReproject && self.parent.map.crs !== self.parent.storageCRS) {
                var clone = feature.clone();
                clone.getGeometry().transform(self.parent.map.crs, self.parent.storageCRS);

                return clone;
            }

            return feature;
        }).sort(function (a, b) {

            if (a.getGeometry() instanceof ol.geom.Point &&
                !(b.getGeometry() instanceof ol.geom.Point)) {
                return -1;
            }

            if (b.getGeometry() instanceof ol.geom.Point &&
                !(a.getGeometry() instanceof ol.geom.Point)) {
                return 2;
            }

            if (a.getProperties().name < b.getProperties().name) { return -1; }
            if (a.getProperties().name > b.getProperties().name) { return 1; }

            return 0;
        });

        return {
            features: parser.writeFeatures(features), layout: layout
        };
    };

    TC.wrap.control.Geolocation.prototype.export = function (type, li) {
        const self = this;
        return new Promise(function (resolve, reject) {
            var features = [];

            self.parent.getTrackingData(li).then(function (data) {
                if (data) {

                    var olFeatures = new ol.format.GeoJSON().readFeatures(data.data);

                    if (olFeatures.length === 0) {
                        var geoJSON = self.parent.getTrackingData(li);
                        olFeatures = new ol.format.GeoJSON().readFeatures(geoJSON);
                    }

                    features = olFeatures.map(function (feature) {
                        var clone = feature.clone();
                        clone.getGeometry().transform(self.parent.map.crs, 'EPSG:4326');

                        if (!(clone.getGeometry() instanceof ol.geom.LineString)) {
                            return clone;
                        } else {
                            return new ol.Feature({
                                geometry: new ol.geom.MultiLineString([clone.getGeometry().getCoordinates()], ('XYZM'))
                            });
                        }
                    });
                }

                switch (type) {
                    case 'GPX':
                        resolve(features ? new ol.format.GPX().writeFeatures(features) : null);
                        break;
                    case 'KML':
                        resolve(features ? new ol.format.KML().writeFeatures(features) : null);
                        break;
                }
            });
        });
    };

    var segmentsUnion = function (lineStrings) {
        var mergedIndex = [];
        var coords = [];
        if (lineStrings.length > 1) {

            if (lineStrings[0].length == 4) {
                lineStrings = lineStrings.sort(function (a, b) {
                    if (a[0][3] == b[0][3])
                        return 0;
                    else if (a[0][3] < b[0][3])
                        return -1;
                    else return 1;
                });
            }

            for (var ls = 0; ls < lineStrings.length; ls++) {
                var lineString = lineStrings[ls];
                var nextLineIndex = -1;
                var distance = Infinity;

                var last = lineString.getLastCoordinate();
                for (var nls = ls + 1; nls < lineStrings.length; nls++) {
                    var first = lineStrings[nls].getFirstCoordinate();
                    var d = Math.hypot(last[0] - first[0], last[1] - first[1]);
                    if (d < distance) {
                        nextLineIndex = nls;
                        distance = d;
                    }
                }

                if (mergedIndex.length < lineStrings.length) {
                    if (mergedIndex.indexOf(ls) == -1) {
                        mergedIndex.push(ls);
                        coords = coords.concat(lineString.getCoordinates());
                    }
                    if (mergedIndex.indexOf(nextLineIndex) == -1) {
                        mergedIndex.push(nextLineIndex);
                        coords = coords.concat(lineStrings[nextLineIndex].getCoordinates());
                    }
                }
            }

            //self.map.toast(self.parent.getLocaleString("geo.trk.simulateWarning"), { type: TC.Consts.msgType.WARNING });

            return coords;
        }

        return lineStrings[0].getCoordinates();
    };

    TC.wrap.control.Geolocation.prototype.processImportedFeatures = function (options) {
        var self = this;

        var source = self.parent.layerTrack.wrap.layer.getSource();
        var fileName = self.parent.importedFileName;
        var names = [];
        var toAdd = [];
        var toRemove = [];
        var maybeRemove = [];
        var features = source.getFeatures();

        var segments = [];
        var coord = [];

        var getName = function (feature) {
            if (feature.getProperties().hasOwnProperty("name")) {
                if (feature.getProperties().name.trim().length > 0)
                    names.push(feature.getProperties().name);
                else names.push(fileName);
            }
            else names.push(fileName);
        };

        for (var f = 0; f < features.length; f++) {
            var feature = features[f];

            if (feature instanceof TC.Feature)
                feature = features[f].wrap.feature;

            if (feature.getGeometry() instanceof ol.geom.Point) {
                coord.push(feature.getGeometry().getCoordinates());
                maybeRemove.push(feature);
            }
            else if (feature.getGeometry() instanceof ol.geom.LineString) {
                // GLS: 31/01/2018 Routes (<rte>) are converted into LineString geometries, and tracks (<trk>) into MultiLineString, por tanto, las líneas las cargamos como N Rutas, no las unimos como hasta ahora: // segments.push(feature.getGeometry());                
                getName(feature);
                toAdd.push(new ol.Feature({
                    geometry: new ol.geom.LineString(feature.getGeometry().getCoordinates(), feature.getGeometry().getLayout())
                }));
                toRemove.push(feature);
            }
            else if (feature.getGeometry() instanceof ol.geom.MultiLineString) {
                var clone = feature.clone();
                getName(clone);

                var ls = clone.getGeometry().getLineStrings();

                var coords = segmentsUnion(ls);
                toAdd.push(new ol.Feature({
                    geometry: new ol.geom.LineString(coords, feature.getGeometry().getLayout())
                }));
                toRemove.push(feature);
            }
        }

        if (segments.length > 0) {
            var coords = segmentsUnion(segments);
            toAdd.push(new ol.Feature({
                geometry: new ol.geom.LineString(coords)
            }));
        }

        if (coord.length > 0 && maybeRemove.length == features.length) {
            toAdd.push(new ol.Feature({
                geometry: new ol.geom.LineString(coord)
            }));
        }

        if (toRemove.length > 0)
            for (var i = 0; i < toRemove.length; i++)
                source.removeFeature(toRemove[i]);

        if (toAdd.length > 0) {
            var sameName = function (array, element) {
                var indices = [];
                var idx = array.indexOf(element);
                while (idx != -1) {
                    indices.push(idx);
                    idx = array.indexOf(element, idx + 1);

                    if (indices.length > 1)
                        return true;
                }

                return indices.length > 1 ? true : false;
            };

            var featureToAdd;
            var index = 0;
            var processAdd = function () {
                const promises = toAdd.map(function (ta, idx) {
                    return new Promise(function (resolve, reject) {
                        if (featureToAdd) {
                            source.removeFeature(featureToAdd);
                        }

                        var name;
                        if (names.length > idx) {
                            var name = names[idx];
                            if (sameName(names, name))
                                name = '[' + (idx + 1) + ']' + ' ' + name;
                        }

                        self.parent.importedFileName = name ? name : fileName;

                        featureToAdd = toAdd[idx];
                        source.addFeature(featureToAdd);

                        self.parent.saveTrack({
                            message: self.parent.getLocaleString('geo.trk.upload.ok', { trackName: name ? name : fileName }),
                            importedFileName: name ? name : fileName,
                            notReproject: options.notReproject
                        }).then(function (importedIndex) {
                            if (idx == 0) {
                                index = importedIndex;
                            }
                            resolve();
                        });
                    });
                });
                return Promise.all(promises);
            };
            processAdd().then(function () {

                self.parent.layerTrack.setVisibility(false);
                self.parent.layerTrack.clearFeatures();

                self.parent.trigger(self.parent.Const.Event.IMPORTEDTRACK, { index: index });

                delete self.parent.importedFileName;
                self.parent.getLoadingIndicator().removeWait(options.wait);
            });
        } else {

            if (self.parent.layerTrack) {
                self.parent.map.removeLayer(self.parent.layerTrack);
                self.parent.layerTrack = undefined;
            }

            delete self.parent.importedFileName;
            self.parent.getLoadingIndicator().removeWait(options.wait);
            TC.alert(self.parent.getLocaleString("geo.trk.upload.error4"));
        }
    };

    TC.wrap.control.Geolocation.prototype.import = function (wait, data, type) {
        var self = this;
        var vectorSource;
        var listenerKey;

        if (data && data.text) {

            var layerOptions = self.parent.layerTrack.wrap.createVectorSource({
                data: data.text,
                type: type
            });
            vectorSource = layerOptions.source;

            listenerKey = vectorSource.on('change', function (e) {
                if (vectorSource.getState() == 'ready') {
                    ol.Observable.unByKey(listenerKey);
                    self.processImportedFeatures(wait);
                }
            });

            var olLayer = self.parent.layerTrack.wrap.layer;
            olLayer.setSource(vectorSource);

        } else {

            if (self.parent.layerTrack) {
                self.parent.map.removeLayer(self.parent.layerTrack);
                self.parent.layerTrack = undefined;
            }

            delete self.parent.importedFileName;
            self.parent.getLoadingIndicator().removeWait(wait);
            TC.alert(self.parent.getLocaleString("geo.trk.upload.error4"));
        }
    };

    var idRequestAnimationFrame;
    TC.wrap.control.Geolocation.prototype.simulateTrackEnd = function () {
        var self = this;

        self.parent.chartProgressClear();

        if (self.simulateMarker) {
            window.cancelAnimationFrame(idRequestAnimationFrame);
            if (self.simulateMarker.layer.wrap.layer.getSource().getFeatures().length > 0)
                self.simulateMarker.layer.removeFeature(self.simulateMarker);

            delete self.simulateMarker;
        }
    };

    TC.wrap.control.Geolocation.prototype.simulateTrack = function () {
        var self = this;

        var coordinates;
        var features = self.parent.layerTrack.wrap.layer.getSource().getFeatures();
        for (var ls = 0; ls < features.length; ls++) {
            if (features[ls].getGeometry() instanceof ol.geom.LineString) {
                coordinates = features[ls].getGeometry().getCoordinates();
                break;
            }
        }

        if (coordinates && coordinates.length > 0) {
            var first = coordinates[0];

            var setSimulateMarker = function () {
                return new Promise(function (resolve, reject) {
                    if (!self.simulateMarker) {
                        self.parent.layerTrack.addPoint(first.slice(0, 2), {
                            radius: 7,
                            fillColor: '#ff0000',
                            fillOpacity: 0.5,
                            strokeColor: '#ffffff',
                            strokeWidth: 2
                        }).then(function (f) {
                            resolve(f);
                        });
                    } else {
                        self.simulateMarker.setCoords(first.slice(0, 2));
                        resolve(self.simulateMarker);
                    }
                });
            };
            setSimulateMarker().then(function (f) {
                self.simulateMarker = f;

                var animationFrameFraction = function () {
                    var trackLength = coordinates.length;
                    var start, finish;
                    var duration;
                    var fraction;
                    var hasTime = false;

                    const toLength = function (coords) {
                        if (self.parent.map.crs !== self.parent.map.options.utmCrs) {
                            return TC.Util.reproject(coords, self.parent.map.crs, self.parent.map.options.utmCrs);
                        }

                        return coords;
                    };

                    var arCoordinates = coordinates;
                    if (arCoordinates[0].length == 4 && arCoordinates[0][3] > 0) {
                        start = arCoordinates[0][3];
                        finish = arCoordinates[arCoordinates.length - 1][3];
                        hasTime = true;
                    } else {
                        arCoordinates[0][3] = Date.now();

                        for (var i = 1; i < arCoordinates.length; i++) {
                            var done;
                            arCoordinates[i][3] = 0;

                            if (i + 1 < arCoordinates.length) {
                                done = new ol.geom.LineString(toLength(arCoordinates.slice(i - 1, i + 1))).getLength();
                            } else {
                                done = new ol.geom.LineString(toLength(arCoordinates.slice(i - 1))).getLength();
                            }

                            arCoordinates[i][3] = arCoordinates[i - 1][3] + (3600000 * done / self.parent.walkingSpeed);
                        }

                        start = arCoordinates[0][3];
                        finish = arCoordinates[arCoordinates.length - 1][3];
                    }

                    var trackFilm = new ol.geom.LineString(arCoordinates);
                    var timestamp = start;
                    var distance = 0;

                    if (self.parent.map.crs !== self.parent.map.options.utmCrs) {
                        distance = new ol.geom.LineString(toLength(JSON.parse(JSON.stringify(arCoordinates)))).getLength();
                    } else {
                        distance = trackFilm.getLength();
                    }

                    var done = 0;
                    var getDoneAtM = function (m) {
                        for (var i = 0; i < arCoordinates.length; i++) {
                            if (arCoordinates[i][3] > m)
                                return {
                                    d: new ol.geom.LineString(toLength(arCoordinates.slice(0, i))).getLength(),
                                    p: arCoordinates[i - 1].slice(0, 2)
                                };
                        }
                    };

                    var loopAtFraction = function () {

                        if (!self.parent.simulate_paused) {
                            var position = trackFilm.getCoordinateAtM(timestamp);
                            var d = getDoneAtM(timestamp);

                            if (fraction >= 1 || !position || !d) {
                                self.simulateTrackEnd();
                                var li = self.parent.getSelectedTrack();
                                if (li)
                                    self.parent.uiSimulate(false, li);

                                if (self.parent.hasElevation) {
                                    self.parent.chartProgressClear();
                                }

                                return;
                            } else {

                                if (self.parent.hasElevation) {
                                    self.parent.chartSetProgress(d, position, distance, (hasTime ? self.parent._getTime(arCoordinates[0][3], position[3]) : false));
                                }

                                if (self.simulateMarker) {
                                    var from = self.simulateMarker.getCoords();
                                    var to = position;
                                    var rotation = Math.atan2(to[1] - from[1], to[0] - from[0]) * 180 / Math.PI;

                                    self.simulateMarker.setCoords(position);
                                    //self.simulateMarker.setStyle({ angle: rotation });
                                }

                                if (self.parent.simulate_speed !== 1)
                                    timestamp = timestamp + (self.parent.delta * self.parent.simulate_speed);
                                else
                                    timestamp = timestamp + self.parent.delta;
                            }
                        }

                        idRequestAnimationFrame = requestAnimationFrame(loopAtFraction);
                    };
                    idRequestAnimationFrame = requestAnimationFrame(loopAtFraction);

                };

                const hasD3 = new Promise(function (resolve, reject) {
                    if (window.d3) {
                        resolve();
                    }
                    else {
                        TC.loadJS(!window.d3, [TC.Consts.url.D3C3], function () {
                            resolve();
                        });
                    }
                });
                hasD3.then(function () {
                    idRequestAnimationFrame = requestAnimationFrame(animationFrameFraction);
                });
            });
        }
    };

    TC.wrap.control.Geolocation.prototype.headingChangehandler = function (evt) {
        var self = this;
        if (!self.parent.track.infoOnMap) {
            self.parent.track.infoOnMap = document.createElement('div');
            const iomStyle = self.parent.track.infoOnMap.style;
            iomStyle.overFlowY = 'scroll';
            iomStyle.height = '200px';
            iomStyle.width = '200px';
            iomStyle.top = '0';
            iomStyle.left = '100px';
            iomStyle.backgroundColor = 'fuchsia';
            iomStyle.position = 'absolute';
            self.parent.map.div.appendChild(self.parent.track.infoOnMap);
        }

        self.parent.track.infoOnMap.style.display = '';

        self.heading = evt.target.getHeading();

        self.parent.track.infoOnMap.innerHTML = self.parent.track.infoOnMap.innerHTML +
            '<br> <p> salta headingChangehandler </p> <br> <p> evt.target.getHeading(): ' + self.heading + ' </p>';

        

        self.map.wrap.getMap().then(function (map) {
            map.getView().setRotation(-self.heading);
        });

        self.parent.trigger(self.parent.Const.Event.STATEUPDATED, {
            moving: (heading != undefined && heading > 0)
        });
    };

    TC.wrap.control.Geolocation.prototype.orientationChangehandler = function (event) {
        var self = this;

        var view = self.map.wrap.map.getView();
        var center = view.getCenter();
        var resolution = view.getResolution();
        var beta = event.target.getBeta() || 0;
        var gamma = event.target.getGamma() || 0;

        center[0] -= resolution * gamma * 25;
        center[1] += resolution * beta * 25;

        view.setCenter(view.constrainCenter(center));

        self.parent.trigger(self.parent.Const.Event.STATEUPDATED, {
            moving: (heading != undefined && heading > 0)
        });
    };

    TC.wrap.control.Geolocation.prototype.pulsate = function (circle) {
        var self = this;

        self.pulsated = true;

        var radius = circle.wrap.feature.getGeometry().getRadius();
        var start = new Date().getTime();

        var duration = 500;
        var listenerKey;

        var getRadius = function (elapsed) {
            switch (true) {
                case elapsed <= 50:
                    return radius;
                case elapsed > 50 && elapsed <= 100:
                    return radius * 1.02;
                case elapsed > 100 && elapsed <= 150:
                    return radius * 1.05;
                case elapsed > 150 && elapsed <= 200:
                    return radius * 1.02;
                case elapsed > 200 && elapsed <= 300:
                    return radius;
                case elapsed > 300 && elapsed <= 350:
                    return radius * 1.02;
                case elapsed > 350 && elapsed <= 400:
                    return radius * 1.05;
                case elapsed > 400 && elapsed <= 450:
                    return radius * 1.02;
                case elapsed > 450 && elapsed <= 500:
                    return radius * 1;
                default:
                    return radius;
            }
        };
        listenerKey = self.olMap.on(ol.render.EventType.POSTCOMPOSE, function (event) {
            var vectorContext = event.vectorContext;
            var frameState = event.frameState;

            var elapsed = frameState.time - start;

            var f = circle.wrap.feature.getGeometry().clone();
            var r = getRadius(elapsed);
            f.setRadius(r);

            vectorContext.setFillStrokeStyle(
                new ol.style.Fill({
                    color: 'rgba(0, 0, 0, 0.1)'
                }),
                new ol.style.Stroke({
                    color: 'rgba(255, 0, 0, .8)', width: 1
                })
            );
            vectorContext.drawCircleGeometry(f);

            if (elapsed > duration) {
                ol.Observable.unByKey(listenerKey);
                return;
            }

            frameState.animate = true;
        });
    };

    TC.wrap.control.ResultsPanel.prototype.register = function (map) {
        const self = this;
        self.map = map;

        map.wrap.getMap().then(function (olMap) {
            self.olMap = olMap;
        });
    };

    TC.wrap.control.ResultsPanel.prototype.showElevationMarker = function (options) {
        const self = this;
        options = options || {};
        const data = options.data;
        const layer = options.layer;
        const coords = options.coords;

        if (!self.elevationMarker) {
            const elm = document.createElement('div');
            elm.style.display = 'none';
            elm.classList.add('tc-ctl-geolocation-trackMarker');
            elm.classList.add('elevation');
            self.elevationMarker = new ol.Overlay({
                element: elm,
                offset: [0, -11],
                positioning: ol.OverlayPositioning.CENTER_CENTER,
                stopEvent: false
            });
        }

        // GLS: si la capa del track está visible mostramos marcamos punto del gráfico en el mapa
        if (layer.getVisibility() && layer.getOpacity() > 0) {
            self.elevationMarker.getElement().style.display = '';
            self.olMap.addOverlay(self.elevationMarker);
            self.elevationMarker.setPosition(coords[data[0].index]);
        }

        // No centrar en el marker
        //var extent = self.map.getExtent();
        //var p = coords[data[0].index];
        //if (p[0] >= extent[0] && p[0] <= extent[2] && p[1] >= extent[1] && p[1] <= extent[3]) { }
        //else {
        //    self.map.setCenter(p.slice(0, 2), { animate: true });
        //}
    };

    TC.wrap.control.ResultsPanel.prototype.hideElevationMarker = function () {
        if (this.elevationMarker) {
            this.elevationMarker.getElement().style.display = 'none';
        }
    };

    TC.wrap.control.Coordinates.prototype.coordsActivate = function () {
        var self = this;

        self.olMap.on(ol.MapBrowserEventType.SINGLECLICK, self._coordsTrigger);
    };

    TC.wrap.control.Coordinates.prototype.coordsDeactivate = function () {
        var self = this;

        self.olMap.un(ol.MapBrowserEventType.SINGLECLICK, self._coordsTrigger);
    };

    TC.wrap.Parser = function () {
    };

    TC.wrap.Parser.prototype.read = function (data) {
        var result = [];
        var self = this;
        if (self.parser) {
            if (!TC.Feature) {
                TC.syncLoadJS(TC.apiLocation + 'TC/Feature');
            }
            result = $.map(self.parser.readFeatures(data), function (feat) {
                return new TC.Feature(null, {
                    id: feat.getId(), data: feat.getProperties()
                });
            });
        }
        return result;
    };

    TC.wrap.parser = {
        WFS: function (options) {
            this.parser = new ol.format.WFS(options);
        },
        JSON: function (options) {
            this.parser = new ol.format.GeoJSON(options);
        }
    };
    TC.inherit(TC.wrap.parser.WFS, TC.wrap.Parser);
    TC.inherit(TC.wrap.parser.JSON, TC.wrap.Parser);

    TC.wrap.control.OverviewMap.prototype.register = function (map) {
        var self = this;

        self.parent.layer.wrap.getLayer().then(function (olLayer) {
            self.ovMap = new ol.control.OverviewMap({
                target: self.parent.div,
                collapsed: false,
                collapsible: false,
                className: self.parent.CLASS + ' ol-overviewmap',
                layers: [olLayer]
            });
            self.ovMap._wrap = self;

            /* 08/02/2019 GLS: 
                Establecemos el pixelRatio siempre a uno (aunque el control instancie un olMap internamente no admite el paso de la opción pixelRatio,
                imposible de entender, por eso lo hago directamente), porque OL sólo atiende al valor al principio,
                si después se hace zoom in/out del navegador, OL no atiende el cambio lo que provoca que el mapa se vea borroso, click se sitúa mal,
                popup se sitúa entre otros efectos.
                Lo gestionamos nosotros hasta que lo soporten del todo. Relacionado con las tareas/bugs:
                    Bug 25976:Mapa situación en blanco
                    Bug 25954:Canvas en blanco con zoom mayor al 100%
                    Bug 23855:Mapa de situación se muestra en blanco
            */
            self.ovMap.getOverviewMap().pixelRatio_ = 1;

            // Quitamos el drag&drop añadido en OL 4.1.0 machacando el overlay
            self.ovMap.ovmap_.removeOverlay(self.ovMap.boxOverlay_);
            var box = document.createElement('DIV');
            box.className = 'ol-overviewmap-box';
            box.style.boxSizing = 'border-box';
            self.ovMap.boxOverlay_ = new ol.Overlay({
                position: [0, 0],
                positioning: ol.OverlayPositioning.BOTTOM_LEFT,
                element: box
            });
            self.ovMap.ovmap_.addOverlay(self.ovMap.boxOverlay_);

            // mantenemos el ancho y alto del canvas en números enteros
            self.manageSize.call(self.ovMap.ovmap_);

            self._boxElm = self.ovMap.boxOverlay_.getElement();

            TC.loadJS(
                !window.Draggabilly,
                [TC.apiLocation + 'lib/draggabilly/draggabilly.pkgd.min.js'],
                function () {
                    var ovmMap = self.ovMap.ovmap_;
                    const drag = new Draggabilly(self._boxElm);
                    // Parcheamos Draggabilly para que respete las otras transformaciones, por ejemplo rotación.
                    drag.positionDrag = function () {
                        const style = this.element.style;
                        const newTransform = 'translate3d( ' + this.dragPoint.x +
                            'px, ' + this.dragPoint.y + 'px, 0)';
                        if (style.transform.length) {
                            const idxStart = style.transform.indexOf('translate3d');
                            if (idxStart >= 0) {
                                const idxEnd = style.transform.indexOf(')', idxStart);
                                style.transform = style.transform.replace(style.transform.substring(idxStart, idxEnd + 1), newTransform);
                            }
                            else {
                                style.transform = newTransform + ' ' + style.transform;
                            }
                        }
                        else {
                            style.transform = newTransform;
                        }
                    };
                    drag.on('pointerDown', function (e) {
                        drag.dragged = self._boxElm.cloneNode();
                        drag.dragged.classList.add(TC.Consts.classes.ACTIVE);
                        drag.dragged.style.position = 'absolute';
                        self._boxElm.insertAdjacentElement('beforebegin', drag.dragged);
                        if (map.maxExtent) {
                            var bottomLeft = ovmMap.getPixelFromCoordinate([map.maxExtent[0], map.maxExtent[1]]);
                            var topRight = ovmMap.getPixelFromCoordinate([map.maxExtent[2], map.maxExtent[3]]);
                            var mapSize = ovmMap.getSize();
                            const container = document.createElement('div');
                            container.style.position = 'absolute';
                            container.style.bottom = Math.round(mapSize[1] - bottomLeft[1]) + 'px';
                            container.style.left = Math.round(bottomLeft[0]) + 'px';
                            container.style.top = Math.round(topRight[1]) + 'px';
                            container.style.right = Math.round(mapSize[0] - topRight[0]) + 'px';
                            const viewport = ovmMap.getViewport();
                            viewport.insertBefore(container, viewport.firstElementChild);
                            drag.options.containment = container;
                        }
                    });
                    drag.on('pointerUp', function (e) {
                        drag.dragged.parentElement.removeChild(drag.dragged);
                        if (map.maxExtent) {
                            ovmMap.getViewport().removeChild(drag.options.containment);
                            drag.options.containment = null;
                        }
                    });
                    drag.on('dragMove', function (e, pointer, moveVector) {
                        drag._delta = moveVector;
                    });
                    drag.on('dragEnd', function (e, pointer) {
                        var olMap = self.ovMap.getMap();
                        var view = olMap.getView();
                        var centerPixel = ovmMap.getPixelFromCoordinate(view.getCenter());
                        var newCenter = ovmMap.getCoordinateFromPixel([centerPixel[0] + drag._delta.x, centerPixel[1] + drag._delta.y]);
                        var extent = map.getExtent();
                        var halfWidth = (extent[2] - extent[0]) / 2;
                        var halfHeight = (extent[3] - extent[1]) / 2;

                        if (newCenter[0] + halfWidth > map.maxExtent[2]) {
                            newCenter[0] = map.maxExtent[2] - halfWidth;
                        }
                        else if (newCenter[0] - halfWidth < map.maxExtent[0]) {
                            newCenter[0] = map.maxExtent[0] + halfWidth;
                        }
                        if (newCenter[1] + halfHeight > map.maxExtent[3]) {
                            newCenter[1] = map.maxExtent[3] - halfHeight;
                        }
                        else if (newCenter[1] - halfHeight < map.maxExtent[1]) {
                            newCenter[1] = map.maxExtent[1] + halfHeight;
                        }

                        drag.setPosition(0, 0);
                        delete drag._delta;
                        map.setCenter(newCenter, { animate: true });
                    });
                });

            map.wrap.getMap().then(function (olMap) {

                // Modificamos mapa para que tenga la proyección correcta
                self.reset();

                const load = self.parent.div.querySelector('.' + self.parent.CLASS + '-load');
                olLayer._wrap.$events.on(TC.Consts.event.BEFORETILELOAD, function () {
                    load.classList.remove(TC.Consts.classes.HIDDEN);
                    load.classList.add(TC.Consts.classes.VISIBLE);
                });
                olLayer._wrap.$events.on(TC.Consts.event.TILELOAD, function () {
                    load.classList.remove(TC.Consts.classes.VISIBLE);
                    load.classList.add(TC.Consts.classes.HIDDEN);
                });

                olMap.addControl(self.ovMap);

                self.parent.isLoaded = true;
                self.parent.trigger(TC.Consts.event.MAPLOAD);
            });
        });
    };

    TC.wrap.control.OverviewMap.prototype.reset = function (options) {
        const self = this;
        return new Promise(function (resolve, reject) {
            const setLayer = function (layer, crs) {
                if (layer.type === TC.Consts.layerType.WMTS) {
                    var layerProjectionOptions = { crs: crs || self.parent.map.crs, oldCrs: layer.wrap.layer.getSource().getProjection().getCode() }; // , allowFallbackLayer: true

                    if (layerProjectionOptions.oldCrs !== layerProjectionOptions.crs) {
                        layer.setProjection(layerProjectionOptions);
                    }
                }

                layer.wrap.getLayer().then(function (olLayer) {

                    var olView = new ol.View(getResolutionOptions(self.parent.map.wrap, olLayer._wrap.parent));

                    if (olView.getResolutions()) {
                        olView.setResolution(olView.getResolutions().filter(function (res) {
                            return res > olView.getResolutionForExtent(self.parent.map.getExtent(), olMap.getSize())
                        }).reverse()[0]);

                        olMap.setView(olView);
                    } else if (olView.getProjection().getCode() !== olMap.getView().getProjection().getCode()) {
                        olMap.setView(olView);
                    }

                    // para controlar el mapa en blanco en IE en la carga inicial
                    olLayer._wrap.$events.one(TC.Consts.event.TILELOAD, function () {
                        olMap.getLayers().getArray()[0].getSource().refresh();
                    });

                    if (layer !== self.parent.layer || olMap.getLayers().getArray().indexOf(layer) === -1) {

                        self.parent.map.trigger(TC.Consts.event.OVERVIEWBASELAYERCHANGE, { oldLayer: layer !== self.parent.layer ? self.parent.layer : null, newLayer: layer });
                        olMap.getLayers().forEach(function (l) {
                            if (l instanceof ol.layer.Image || l instanceof ol.layer.Tile) {
                                olMap.removeLayer(l);
                            }
                        });

                        const load = self.parent.div.querySelector('.' + self.parent.CLASS + '-load');
                        olLayer._wrap.$events.on(TC.Consts.event.BEFORETILELOAD, function () {
                            load.classList.remove(TC.Consts.classes.HIDDEN);
                            load.classList.add(TC.Consts.classes.VISIBLE);
                        });
                        olLayer._wrap.$events.on(TC.Consts.event.TILELOAD, function () {
                            load.classList.remove(TC.Consts.classes.VISIBLE);
                            load.classList.add(TC.Consts.classes.HIDDEN);
                        });

                        olMap.getLayers().insertAt(0, olLayer); // GLS: no usamos .addLayer(olLayer) para asegurar que la capa a añadir quede como fondo.
                    }

                    resolve(layer);
                });
            };

            options = options || {};
            var layer = options.layer || self.parent.layer;
            if (self.parent.map && layer && self.ovMap) {
                var olMap = self.ovMap.ovmap_;

                layer.getCapabilitiesPromise().then(function () {

                    var originalLayer = layer;

                    if (!layer.isCompatible(self.parent.map.crs) && layer.wrap.getCompatibleMatrixSets(self.parent.map.crs).length === 0) {
                        layer = layer.getFallbackLayer() || self.parent.defaultLayer;

                        layer.getCapabilitiesPromise().then(function () {
                            if (self.parent.map.on3DView && !layer.isCompatible(self.parent.map.crs)) {
                                self.parent.map.loadProjections({
                                    crsList: originalLayer.getCompatibleCRS(),
                                    orderBy: 'name'
                                }).then(function (projList) {
                                    setLayer(originalLayer, projList[0].code);
                                });
                            } else if (layer.isCompatible(self.parent.map.crs)) {
                                setLayer(layer);
                            }
                        });
                    } else {
                        setLayer(layer);
                    }
                });
            }
        });
    };

    TC.wrap.control.OverviewMap.prototype.get3DCameraLayer = function () {
        var self = this;
        var result = null;
        var camLayerId = '3DCamera';
        var ovMap;

        if (self.ovMap) {
            ovMap = self.ovMap.getOverviewMap();
            ovMap.getLayers().forEach(function (elm) {
                if (elm.get('id') === camLayerId) {
                    result = elm;
                }
            });

            if (!result) {
                var ovMap = self.ovMap.getOverviewMap();
                var fovStyle = createNativeStyle({});
                // Ponemos los cuadriláteros de fov sin relleno (por legibilidad)
                fovStyle[0].getFill().setColor([0, 0, 0, 0]);
                result = new ol.layer.Vector({
                    id: camLayerId,
                    source: new ol.source.Vector(),
                    style: fovStyle
                });
                ovMap.addLayer(result);
            }
        }
        return result;
    };

    TC.wrap.control.OverviewMap.prototype.draw3DCamera = function (options) {
        var self = this;

        if (this.parent.map.isLoaded) {
            self.is3D = !!options;
            var camLayer = self.get3DCameraLayer();
            if (camLayer) {
                var feature;
                options = options || {
                };
                var fov = options.fov;
                var source = camLayer.getSource();
                if (!fov || !fov.length) { // no vemos terreno o no estamos en vista 3D
                    source.clear();
                }
                else {
                    var features = source.getFeatures();
                    if (!features.length) {
                        feature = new ol.Feature();
                        source.addFeature(feature);
                    }
                    else {
                        feature = features[0];
                    }
                    feature.setGeometry(new ol.geom.Polygon([fov]));
                }
                var heading = (typeof options.heading === 'number') ? options.heading : 0;
                self._boxElm.style.transform = 'rotate(' + heading + 'rad)';
            }
        }
    };

    TC.wrap.control.OverviewMap.prototype.enable = function () {
        var self = this;
        if (self.parent.layer && self.parent.layer.setVisibility) {
            self.parent.layer.setVisibility(true);

            /* GLS: bug 23855: mapa de situación se muestra en blanco
                En el resize se valida el alto y el ancho y como el div padre (id = "ovmap") tiene display: none, 
                el ancho y el alto devuelven cero y por ello se muestra en blanco. 
                No vale con lanzar .trigger('resize') porque no utiliza los valores actuales del div, 
                sino los almacenados, por eso llamamos a updateSize que actualiza dichos valores.
                https://tfsapp.tracasa.es:8088/tfs/web/wi.aspx?pcguid=4819cc6e-400e-4f70-ba7c-c18a830405aa&id=23855                
            */
            self.parent.wrap.ovMap.ovmap_.updateSize();

            // Lo siguiente es para actualizar mapa de situación
            const resizeEvent = document.createEvent('HTMLEvents');
            resizeEvent.initEvent('resize', false, false);
            self.parent.map.div.dispatchEvent(resizeEvent);
        }
    };

    TC.wrap.control.OverviewMap.prototype.disable = function () {
        var self = this;
        if (self.parent.layer && self.parent.layer.setVisibility) {
            self.parent.layer.setVisibility(false);
        }
    };

    TC.wrap.control.OverviewMap.prototype.manageSize = function () {
        const self = this;

        TC.wrap.Map.prototype.manageSize.call(self);
    };

    TC.wrap.control.FeatureInfo.prototype.register = function (map) {
        var self = this;
        map.wrap.getMap().then(function (olMap) {
            TC.wrap.control.Click.prototype.register.call(self, map);
            var _clickTrigger = self._trigger;
            self._trigger = function (e) {
                var result = _clickTrigger.call(self, e);
                if (result) {
                    self.parent.beforeRequest({ xy: e.pixel });
                }
                else {
                    map.trigger(TC.Consts.event.NOFEATUREINFO, { control: self.parent });
                }
                return result;
            }
        });
    };

    var bufferElm;
    var getElementText = function (elm) {
        var text = elm.innerHTML || elm.textContent;
        bufferElm = bufferElm || document.createElement("textarea");
        bufferElm.innerHTML = text;
        return bufferElm.value;
    };

    var esriXmlParser = {
        readFeatures: function (text) {
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
                        var attributes = {
                        };
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

    var addLayerToService = function (service, layer, name) {
        var path = layer.getPath(name);
        service.layers.push({
            name: name,
            title: path[path.length - 1],
            path: path.slice(1),
            features: []
        });
    };

    TC.wrap.control.FeatureInfo.prototype.getFeatureInfo = function (coords, resolution, options) {
        var self = this;
        var opts = options || {};
        var map = self.parent.map;
        map.wrap.getMap().then(function (olMap) {
            var targetServices = {};
            var auxInfo = {};
            const requestPromises = [];
            const requestDataArray = [];
            var featurePromises = [];
            var services = [];

            //var infoFormats = [];
            var layers = olMap.getLayers().getArray();

            // GLS: filtro el array de capas para quedarnos con las capas que son raster y visibles.
            layers = layers.filter(function (elem) { return elem instanceof ol.layer.Image && elem.getVisible(); });

            for (var j = 0; j < layers.length; j++) {
                var olLayer = layers[j];
                var layer = olLayer._wrap.parent;
                var source = olLayer.getSource();

                //console.log("Source: " + layer.layerNames.join(","));
                //Por qué en workLayers están el vectorial de medición, y cosas así?
                if (source.getGetFeatureInfoUrl && $.inArray(layer, map.workLayers) >= 0 && layer.names.length > 0
                    && (!opts.serviceUrl || opts.serviceUrl === layer.url)) { // Mirar si en las opciones pone que solo busque en un servicio

                    //
                    var targetService;
                    if (!targetServices[layer.url]) {
                        targetService = {
                            layers: [],
                            mapLayers: [],
                            title: layer.title,
                            request: null
                        };
                        targetServices[layer.url] = targetService;
                        auxInfo[layer.url] = {
                            "source": jQuery.extend(true, {}, source),
                            "layers": []
                        };
                    }
                    else {
                        targetService = targetServices[layer.url];
                        auxInfo[layer.url].source.updateParams(ol.obj.assign(auxInfo[layer.url].source.getParams(), source.getParams()));
                    }
                    targetService.mapLayers.push(layer);

                    //var targetService = {
                    //    layers: [], mapLayers: [layer]
                    //};
                    var disgregatedNames = layer.getDisgregatedLayerNames();
                    if (opts.layerName) { // Mirar si en las opciones pone que solo busque en una capa
                        if (disgregatedNames.indexOf(opts.layerName) >= 0 && olLayer._wrap.getInfo(opts.layerName).queryable) {
                            addLayerToService(targetService, layer, opts.layerName);
                            auxInfo[layer.url].layers.push(opts.layerName);
                        }
                    }
                    else {
                        for (var i = 0; i < disgregatedNames.length; i++) {
                            var name = disgregatedNames[i];
                            if (olLayer._wrap.getInfo(name).queryable) {
                                addLayerToService(targetService, layer, name);
                            }
                            else {
                                TC.Util.consoleRegister('Capa "' + disgregatedNames[i] + '" no queryable, la eliminamos de la petición GFI');
                                disgregatedNames.splice(i, 1);
                                i = i - 1;
                            }
                        }

                        // GLS: validamos si nos queda alguna capa a la cual consultar
                        if (disgregatedNames.length > 0) {
                            auxInfo[layer.url].layers = auxInfo[layer.url].layers.concat(disgregatedNames);
                        }
                    }
                }
            }

            for (var serviceUrl in targetServices) {
                services.push(targetServices[serviceUrl]);
                var targetService = targetServices[serviceUrl];
                var source = auxInfo[serviceUrl].source;
                var layers = auxInfo[serviceUrl].layers;

                // GLS: validamos si hay capas a las cuales consultar, si no hay continuamos con el siguiente servicio
                if (!layers || (layers && layers.length === 0)) {
                    continue;
                }

                var params = source.getParams();
                source.params_.LAYERS = layers.join(',');
                var gfiURL = source.getGetFeatureInfoUrl(coords, resolution, map.crs, {
                    'QUERY_LAYERS': layers.join(','),
                    'INFO_FORMAT': params.INFO_FORMAT,
                    'FEATURE_COUNT': 1000,
                    'radius': map.options.pixelTolerance,
                    'buffer': map.options.pixelTolerance
                });

                gfiURL = gfiURL.replace(/sld_body=[a-zA-Z%0-9._]*/); // Quitamos el parámetro sld_body


                var expUrl = gfiURL;
                const requestData = {
                    serviceUrl: serviceUrl,
                    requestedFormat: params.INFO_FORMAT,
                    expandUrl: expUrl
                };
                requestDataArray.push(requestData);
                requestPromises.push(new Promise(function (resolve, reject) {
                    const mapLayer = targetService.mapLayers[0];
                    mapLayer.toolProxification.fetch(gfiURL)
                        .then(function (data) {
                            mapLayer.toolProxification.cacheHost.getAction(requestData.expandUrl).then(function (cache) {
                                requestData.originalUrl = cache.action.call(mapLayer.toolProxification, requestData.expandUrl);
                                resolve($.extend({}, data, requestData));
                            });
                        })
                        .catch(function (error) {
                            reject(Error(error));
                        });
                }));
                TC.Util.consoleRegister("Lanzamos GFI");
            }

            if (requestPromises.length > 0) {
                Promise.all(requestPromises).then(function (responses) {
                    var someSuccess = false;
                    var featureCount = 0;
                    var featureInsertionPoints = [];
                    for (var i = 0; i < responses.length; i++) {
                        var featureInfo = responses[i];
                        var service = targetServices[requestDataArray[i].serviceUrl];
                        someSuccess = true;
                        service.text = featureInfo.responseText;
                        var format;
                        var iFormat = featureInfo.contentType;
                        if (iFormat && iFormat.indexOf(";") > -1)
                            iFormat = iFormat.substr(0, iFormat.indexOf(";")).trim();

                        if (!iFormat) iFormat = featureInfo.requestedFormat;

                        if (iFormat === featureInfo.requestedFormat) {
                            switch (iFormat) {
                                case 'application/json':
                                    format = new ol.format.GeoJSON();
                                    break;
                                case 'application/vnd.ogc.gml':
                                    if (featureInfo.responseText.indexOf("FeatureCollection") > -1) {
                                        format = new ol.format.WFS({
                                            gmlFormat: new ol.format.GML2({
                                                srsName: map.crs
                                            })
                                        });
                                    }
                                    else {
                                        format = new ol.format.WMSGetFeatureInfo();
                                    }
                                    break;
                                case 'application/vnd.ogc.gml/3.1.1':
                                    format = new ol.format.GML3Patched({
                                        srsName: map.crs
                                    });
                                    break;
                                case 'application/vnd.esri.wms_featureinfo_xml':
                                    format = esriXmlParser;
                                    break;
                                default:
                                    format = null;
                                    break;
                            }

                            if (format) {
                                var features = format.readFeatures(featureInfo.responseText, {
                                    featureProjection: ol.proj.get(map.crs)
                                });
                                featureCount = featureCount + features.length;
                                var isParentOrSame = function (layer, na, nb) {
                                    var result = false;
                                    if (na === nb) {
                                        result = true;
                                    }
                                    else {
                                        var pa = layer.getNodePath(na);
                                        var pb = layer.getNodePath(nb);
                                        if (pa.length > 0 && pb.length >= pa.length) {
                                            result = true;
                                            for (var i = 0; i < pa.length; i++) {
                                                if (layer.wrap.getName(pa[i]) !== layer.wrap.getName(pb[i])) {
                                                    result = false;
                                                    break;
                                                }
                                            }
                                        }
                                    }
                                    return result;
                                };

                                var fakeLayers = {
                                };

                                for (var j = 0; j < features.length; j++) {
                                    var feature = features[j];
                                    if (feature instanceof ol.Feature) {
                                        var fid = feature.getId() || TC.getUID();
                                        var found = false;
                                        var layerName = fid.substr(0, fid.lastIndexOf('.'));
                                        for (var k = 0; k < service.layers.length; k++) {
                                            var l = service.layers[k];
                                            var lName = l.name.substr(l.name.indexOf(':') + 1);
                                            if (service.mapLayers.some(function (mapLayer) { return isParentOrSame(mapLayer, lName, layerName) })) {
                                                found = true;
                                                if (!opts.featureId || feature.getId() === opts.featureId) { // Mirar si en las opciones pone que solo busque una feature
                                                    featurePromises.push(TC.wrap.Feature.createFeature(feature, { showsPopup: false }));
                                                    featureInsertionPoints.push(l.features);
                                                }
                                                break;
                                            }
                                        }

                                        //si llegamos aquí y no he encontrado su layer, es que no cuadraba el prefijo del fid con el id del layer
                                        //esto pasa, p.ej, en cartociudad
                                        if (!found) {
                                            //así que creo un layer de palo para la respuesta del featInfo
                                            var fakeLayer;
                                            if (fakeLayers[layerName]) fakeLayer = fakeLayers[layerName];
                                            else {
                                                fakeLayer = {
                                                    name: layerName, title: layerName, path: [layerName], features: []
                                                };
                                                fakeLayers[layerName] = fakeLayer;
                                                service.layers.push(fakeLayer);
                                            }

                                            if (!opts.featureId || feature.getId() === opts.featureId) { // Mirar si en las opciones pone que solo busque una feature
                                                featurePromises.push(TC.wrap.Feature.createFeature(feature, { showsPopup: false }));
                                                featureInsertionPoints.push(fakeLayer.features);
                                            }
                                        }
                                    }
                                }//iteración sobre las features de esta respuesta


                            }
                            else {
                                //si no hay formato reconocido y parseable, metemos un iframe con la respuesta
                                //y prau
                                //para eso, creo una falsa entrada de tipo feature, con un campo especial rawUrl o rawContent

                                var compoundLayer = {
                                    name: 'layer' + TC.getUID(), title: 'Datos en el punto', features: []
                                };

                                service.layers[service.layers.length] = compoundLayer;
                                compoundLayer.features[0] = {
                                    rawUrl: featureInfo.originalUrl, expandUrl: featureInfo.expandUrl, rawContent: featureInfo.responseText, rawFormat: iFormat
                                };
                                featureCount = featureCount + 1;
                            }
                        }
                        else { // iFormat !== featureInfo.requestedFormat

                            // GLS:
                            TC.Util.consoleRegister("Respuesta GFI: lo más probable es que el servidor esté devolviendo una excepción");
                            TC.Util.consoleRegister("Lanzamos los eventos que corresponde y mostramos tostada");

                            // En este caso lo más probable es que el servidor esté devolviendo una excepción
                            self.parent.responseError({
                                message: featureInfo.responseText,
                                status: featureInfo.status
                            });
                            // GLS: misma gestión de error que en ol.js - > function (a, b, c) { // error...
                            map.toast(self.parent.getLocaleString('featureInfo.error'), {
                                type: TC.Consts.msgType.ERROR
                            });
                        }

                    }
                    if (someSuccess) {
                        var finfoPromises = featurePromises;
                        if (featurePromises.length) {
                            finfoPromises = finfoPromises.concat(new Promise(function (resolve, reject) {
                                // Si hay features cargamos el módulo de geometria para encontrar una que se interseque con el punto
                                TC.loadJS(
                                    !TC.Geometry,
                                    TC.apiLocation + 'TC/Geometry',
                                    function () {
                                        resolve();
                                    }
                                );
                            }));
                        }
                        Promise.all(finfoPromises).then(function (features) {
                            var defaultFeature;
                            features.forEach(function (feat, idx) {
                                if (feat) {
                                    feat.attributes = [];
                                    for (var key in feat.data) {
                                        var value = feat.data[key];
                                        if (typeof value !== 'object') {
                                            feat.attributes.push({
                                                name: key,
                                                value: typeof (value) == "number" ? value.toLocaleString(TC.Util.getMapLocale(self.parent.map)) : value
                                            });
                                        }
                                    }
                                    if (!defaultFeature && TC.Geometry.isInside(coords, feat.geometry)) {
                                        defaultFeature = feat;
                                    }
                                    featureInsertionPoints[idx].push(feat);
                                }
                            });

                            var services = [];
                            for (var serviceUrl in targetServices) {
                                if (targetServices.hasOwnProperty(serviceUrl)) {
                                    services.push(targetServices[serviceUrl]);
                                }
                            }

                            self.parent.responseCallback({
                                coords: coords,
                                resolution: resolution,
                                services: services,
                                featureCount: featureCount,
                                defaultFeature: defaultFeature
                            });
                        });
                    }
                },
                    function (a, b, c) { // error
                        if (services && services.length == 0) {
                            for (var serviceUrl in targetServices) {
                                services.push(targetServices[serviceUrl]);
                            }
                        }

                        self.parent.responseCallback({
                            coords: coords, resolution: resolution, services: services, featureCount: 0
                        });
                        map.toast(self.parent.getLocaleString('featureInfo.error'), {
                            type: TC.Consts.msgType.ERROR
                        });
                    });
            }
            else {

                if (map.workLayers.filter(function (layer) {
                    return layer instanceof TC.layer.Raster;
                }).length > 0) {
                    map.toast(self.parent.getLocaleString('featureInfo.notQueryableLayers'), {
                        type: TC.Consts.msgType.INFO
                    });
                }

                if (services && services.length == 0) {
                    for (var serviceUrl in targetServices) {
                        services.push(targetServices[serviceUrl]);
                    }
                }

                // GLS: nos suscribimos TC.Consts.event.BEFOREFEATUREINFO y lanzamos el mismo evento de zero resultados ya que puede darse que la resolución se lance antes del before.
                map.on(TC.Consts.event.BEFOREFEATUREINFO, function () {
                    self.parent.responseCallback({
                        coords: coords, resolution: resolution, services: services, featureCount: 0
                    });
                });

                self.parent.responseCallback({
                    coords: coords, resolution: resolution, services: services, featureCount: 0
                });
            }
        });
    };

    TC.wrap.control.GeometryFeatureInfo.prototype.register = function (map) {
        var self = this;
        map.wrap.getMap().then(function (olMap) {
            TC.wrap.control.Click.prototype.register.call(self, map);
            var _clickTrigger = self._trigger;
            self._trigger = function (e) {
                self.hasEligibleLayers().then(function (hasLayers) {
                    if (hasLayers) {
                        if (!self.parent._isSearching) {
                            if (e.type == ol.MapBrowserEventType.SINGLECLICK && !self.parent._isDrawing && !self.parent._isSearching) {
                                _clickTrigger.call(self, e);
                            }
                        }
                    }
                });
            }

        });
    };

    TC.wrap.control.GeometryFeatureInfo.prototype.hasEligibleLayers = function () {
        const self = this;
        return new Promise(function (resolve, reject) {
            const map = self.parent.map;
            var ret = false;
            map.wrap.getMap().then(function (olMap) {
                olMap.getLayers().forEach(function (olLayer) {
                    var layer = olLayer._wrap.parent;
                    var source = olLayer.getSource();
                    //Por qué en workLayers están el vectorial de medición, y cosas así?
                    if (source.getGetFeatureInfoUrl && $.inArray(layer, map.workLayers) >= 0) {
                        ret = true;
                        return false;   //break del foreach
                    }
                });
                resolve(ret);
            });
        });
    };

    TC.wrap.control.GeometryFeatureInfo.prototype.beginDraw = function (options) {
        var self = this;
        options = options || {};
        var xy = options.xy;
        var layer = options.layer;
        var callback = options.callback;
        var geometryType = options.geometryType;
        var semaforo = false;
        if (!self.drawCtrl) {
            layer.wrap.getLayer().then(function (olLayer) {
                var olGeometryType;
                switch (geometryType) {
                    case TC.Consts.geom.POLYLINE:
                        olGeometryType = ol.geom.GeometryType.LINE_STRING;
                        break;
                    default:
                        olGeometryType = ol.geom.GeometryType.POLYGON;
                        break;
                }
                self.drawCtrl = new ol.interaction.Draw({
                    source: olLayer.getSource(),
                    type: olGeometryType
                    , style: olLayer.getStyle()
                });
                var setShowsPopup = function (wrap) {
                    wrap.parent.showsPopup = false;
                };
                olLayer.getSource().on(ol.source.VectorEventType.ADDFEATURE, function (event) {
                    if (event.feature._wrap) {
                        setShowsPopup(event.feature._wrap);
                    }
                    else {
                        event.feature._wrapPromise.then(setShowsPopup);
                    }
                });
                self.drawCtrl.handleEvent = function (event) {
                    //esta ñapa para solucionar cuando haces un primer punto y acontinuación otro muy rápido
                    if (event.type == ol.MapBrowserEventType.SINGLECLICK) {
                        var points = olGeometryType === ol.geom.GeometryType.POLYGON ? this.sketchCoords_[0] : this.sketchCoords_;
                        if (semaforo && points.length == 2 && this.sketchFeature_ !== null) {// GLS: Añado la misma validación (this.sketchFeature_ !== null) que tiene el código de OL antes de invocar addToDrawing_ 
                            this.addToDrawing_(event);
                        }
                        else {
                            semaforo = true;
                        }
                    }
                    return ol.interaction.Draw.handleEvent.call(this, event)
                }
                const map = self.parent.map;
                const olMap = map.wrap.map;
                olMap.addInteraction(self.drawCtrl);
                self.drawCtrl.on(ol.interaction.DrawEventType.DRAWSTART, function (event) {
                    self.parent._isDrawing = true;
                    olMap.getInteractions().forEach(function (item, i) {
                        if (item instanceof (ol.interaction.DoubleClickZoom))
                            item.setActive(false);
                    });
                });
                self.drawCtrl.startDrawing_({
                    coordinate: xy
                });
                self.drawCtrl.on(ol.interaction.DrawEventType.DRAWEND, function (event) {
                    self.parent._isDrawing = false;
                    olMap.getInteractions().forEach(function (item, i) {
                        if (item instanceof (ol.interaction.DoubleClickZoom))
                            item.setActive(false);
                    });
                    olMap.removeInteraction(self.drawCtrl);
                    this.setActive(false);
                    self.drawCtrl = null;
                    olLayer.getSource().clear();
                    self.parent._drawToken = true;
                    setTimeout(function () {
                        self.parent._drawToken = false;
                    }, 500);
                    if (callback) {
                        TC.wrap.Feature.createFeature(event.feature).then(function (feat) {
                            callback(feat);
                        });
                    }
                });
            });

        }
        else {
            self.drawCtrl.setActive(true);
            self.drawCtrl.startDrawing_({
                coordinate: xy
            });
        }
    };

    TC.wrap.control.GeometryFeatureInfo.prototype.cancelDraw = function (xy, layer, callback) {
        var self = this;
        if (self.drawCtrl && self.parent._isDrawing) {
            self.parent._isDrawing = false;
            self.drawCtrl.setActive(false);
            self.drawCtrl.source_.clear();

        }
    };


    var WFSGetFeatureBuilder = function (map, filter, outputFormat, download) {
        const arrPromises = [];
        var services = {};
        const _getServiceTitle = function (service) {
            const mapLayer = service.mapLayers[0];
            return service.title || service.mapLayers.reduce(function (prev, cur) {
                return prev || cur.title;
            }, '') || (mapLayer.tree && mapLayer.tree.title) || mapLayer.capabilities.Service.Title;
        };
        const olMap = map.wrap.map;
        olMap.getLayers().forEach(function (olLayer) {
            var layer = olLayer._wrap.parent;
            if (!olLayer.getVisible() || $.inArray(layer, map.workLayers) < 0 || layer.type !== TC.Consts.layerType.WMS)
                return;
            var availableLayers = layer.getDisgregatedLayerNames() || layer.availableNames;
            var serviceObj = services[layer.url.toLowerCase()];
            if (!serviceObj) {
                serviceObj = services[layer.url.toLowerCase()] = {
                    layers: [], mapLayers: [layer], layerNames: []
                };
            }
            for (var i = 0; i < availableLayers.length; i++) {
                var name = availableLayers[i];
                if (!layer.isVisibleByScale(name) && !download)
                    continue;
                if (!layer.wrap.getInfo(name).queryable)
                    continue;
                serviceObj.layerNames.push(name);
                var path = layer.getPath(name);
                serviceObj.layers.push({
                    name: name,
                    title: path[path.length - 1],
                    path: path.slice(1),
                    features: []
                });
            }
            if (serviceObj.layerNames.length == 0)
                return;
            if (typeof (serviceObj.request) !== "undefined") {
                return;
            }
            serviceObj.request = serviceObj.request || layer.getWFSCapabilitiesPromise(); //WFSCapabilities.Promises(url);
            arrPromises.push(new Promise(function (resolve, reject) {
                serviceObj.request.then(function (capabilities) {
                    var service = null;
                    var errors = [];
                    for (var url in services)
                        if (services[url].request && services[url].request == serviceObj.request) {
                            service = services[url];
                        }
                    var _numMaxFeatures = null;
                    var layerList = service.layerNames;
                    if (!(layerList instanceof Array) || !layerList.length) return;//condici\u00f3n de salida
                    //comprobamos que tiene el getfeature habilitado
                    if (typeof (capabilities.Operations.GetFeature) === "undefined") {
                        errors.push({ key: TC.Consts.WFSErrors.GetFeatureNotAvailable, params: { serviceTitle: _getServiceTitle(service) } })
                        resolve({ "errors": errors });
                        return;
                    }
                    var availableLayers = [];
                    for (var i = 0; i < layerList.length; i++) {
                        //Comprbamos si la capa en el WMS tiene el mimso nombre que en el WFS
                        var layer = layerList[i].substring(layerList[i].indexOf(":") + 1);
                        //quitamos los ultimos caracteres que sean "_" , cosas de Idena
                        while (layer[layer.length - 1] === "_") {
                            layer = layer.substring(0, layer.lastIndexOf("_"));
                        }
                        if (!capabilities.FeatureTypes.hasOwnProperty(layer)) {
                            var titles = service.mapLayers[0].getPath(layer);
                            errors.push({ key: TC.Consts.WFSErrors.LayersNotAvailable, params: { serviceTitle: _getServiceTitle(service), "layerName": titles[titles.length - 1] } });
                            continue;
                        }
                        if (availableLayers.indexOf(layer) < 0)
                            availableLayers.push(layer);
                    }
                    if (availableLayers.length == 0) {
                        errors.push({ key: TC.Consts.WFSErrors.NoValidLayers, params: { serviceTitle: _getServiceTitle(service) } });
                        resolve({ "errors": errors });
                        return;
                    }
                    if (capabilities.Operations.GetFeature.CountDefault)
                        _numMaxFeatures = capabilities.Operations.GetFeature.CountDefault.DefaultValue;
                    //comprobamos si soporta querys    
                    if (
                        (capabilities.version === "1.0.0" && !capabilities.Operations.GetFeature.Operations.hasOwnProperty("Query"))
                        ||
                        ((capabilities.version === "2.0.0" || capabilities.version === "1.1.0") && capabilities.Operations.QueryExpressions.AllowedValues.Value.indexOf("wfs:Query") < 0)
                    ) {
                        errors.push({ key: TC.Consts.WFSErrors.QueryNotAvailable, params: { serviceTitle: _getServiceTitle(service) } });
                        resolve({ "errors": errors });
                        return;
                    }
                    var url = (capabilities.Operations.GetFeature.DCPType ? capabilities.Operations.GetFeature.DCPType[1].HTTP.Post.onlineResource : capabilities.Operations.GetFeature.DCP.HTTP.Post["xlink:href"]);

                    // var url2 = service.mapLayers[0].getFeatureUrl(url);
                    service.mapLayers[0].getFeatureUrl(url).then(function (url2) {
                        if (_numMaxFeatures) {
                            jQuery.ajax({
                                url: url2,
                                data: TC.Util.WFSQueryBuilder(availableLayers, filter, capabilities, outputFormat, true),
                                cache: false,
                                contentType: "application/xml",
                                type: "POST",
                            }).then(function () {
                                if (arguments[0] instanceof XMLDocument) {
                                    var responseAsJSON = xml2json(arguments[0]);
                                    if (responseAsJSON.Exception) {
                                        resolve({
                                            errors: [{
                                                key: TC.Consts.WFSErrors.Indeterminate,
                                                params: {
                                                    err: responseAsJSON.Exception.exceptionCode, errorThrown: responseAsJSON.Exception.ExceptionText, serviceTitle: service.mapLayers.reduce(function (prev, cur) {
                                                        return prev || cur.title;
                                                    }, '')
                                                }
                                            }]
                                        })
                                        return;
                                    }
                                }
                                var featFounds = parseInt(responseAsJSON.numberMatched || responseAsJSON.numberOfFeatures, 10)
                                if (isNaN(featFounds) || featFounds > parseInt(_numMaxFeatures, 10)) {
                                    resolve({
                                        errors: [{
                                            key: TC.Consts.WFSErrors.NumMaxFeatures, params: { limit: _numMaxFeatures, serviceTitle: _getServiceTitle(service) }
                                        }]
                                    });
                                    return;
                                }
                                else if (featFounds === 0) {
                                    resolve({
                                        errors: [{
                                            key: TC.Consts.WFSErrors.NoFeatures, params: { serviceTitle: _getServiceTitle(service) }
                                        }]
                                    });
                                }
                                else if (download) {
                                    resolve({
                                        url: url,
                                        data: TC.Util.WFSQueryBuilder(availableLayers, filter, capabilities, outputFormat, false),
                                        service: service,
                                        numFeatures: featFounds,
                                        errors: errors
                                    });
                                }

                            }
                                , function (xhr, textStatus, errorThrown) {
                                    resolve({
                                        errors: [{
                                            key: TC.Consts.WFSErrors.Indeterminate,
                                            params: { err: textStatus, errorThrown: errorThrown, serviceTitle: _getServiceTitle(service) }
                                        }]
                                    });
                                    return;
                                });
                        }
                        else {
                            if (!download) {
                                resolve({
                                    url: url2,
                                    data: TC.Util.WFSQueryBuilder(availableLayers, filter, capabilities, outputFormat, false),
                                    service: service,
                                    errors: errors
                                });
                            }
                        }
                        if (download && !_numMaxFeatures) {
                            resolve({
                                url: url,
                                data: TC.Util.WFSQueryBuilder(availableLayers, filter, capabilities, outputFormat, false),
                                service: service,
                                errors: errors
                            });
                        }
                        if (!download) {
                            jQuery.ajax({
                                url: url2,
                                data: TC.Util.WFSQueryBuilder(availableLayers, filter, capabilities, outputFormat, false),
                                cache: false,
                                contentType: "application/xml",
                                type: "POST",
                            }).then(function () {
                                if (arguments[1] == "success") {
                                    if (arguments[0] instanceof XMLDocument) {
                                        var responseAsJSON = xml2json(arguments[0]);
                                        if (responseAsJSON.Exception) {
                                            resolve({
                                                errors: [{
                                                    key: TC.Consts.WFSErrors.Indeterminate,
                                                    params: {
                                                        err: responseAsJSON.Exception.exceptionCode, errorThrown: responseAsJSON.Exception.ExceptionText, serviceTitle: service.mapLayers.reduce(function (prev, cur) {
                                                            return prev || cur.title;
                                                        }, '')
                                                    }
                                                }]
                                            })
                                            return;
                                        }
                                    }
                                    resolve({ service: service, response: arguments, errors: errors });
                                }
                                else {
                                    reject(arguments);
                                    return;
                                }
                            },
                                function (xhr, textStatus, errorThrown) {
                                    resolve({
                                        errors: [{
                                            key: TC.Consts.WFSErrors.Indeterminate,
                                            params: { err: textStatus, errorThrown: errorThrown, serviceTitle: _getServiceTitle(service) }
                                        }]
                                    });
                                    return;
                                });
                        }
                    });
                }, function (jqXHR, textStatus, errorThrown) {
                    var service = null;
                    for (var title in services)
                        if (services[title].request && services[title].request === serviceObj.request) {
                            service = services[title];
                        }
                    resolve({ errors: [{ key: TC.Consts.WFSErrors.GetCapabilities, params: { err: errorThrown, serviceTitle: _getServiceTitle(service) } }] });
                });
            }));
        });
        return arrPromises;
    };
    TC.WFSGetFeatureBuilder = WFSGetFeatureBuilder;

    var readFeaturesFromResponse = function (map, data, jqXHR) {
        var featureInsertionPoints = [];
        var format;
        var iFormat = jqXHR.getResponseHeader("Content-type");
        if (iFormat && iFormat.indexOf(";") > -1)
            iFormat = iFormat.substr(0, iFormat.indexOf(";")).trim();

        if (!iFormat) iFormat = data.requestedFormat;
        switch (iFormat) {
            case 'application/json':
                format = new ol.format.GeoJSON();
                break;
            case 'application/vnd.ogc.gml':
                if (data.responseText.indexOf("FeatureCollection") > -1)
                    format = new ol.format.WFS({
                        gmlFormat: new ol.format.GML2({
                            srsName: map.crs
                        })
                    });
                else
                    format = new ol.format.WMSGetFeatureInfo();
                break;
            case 'application/vnd.ogc.gml/3.1.1':
                format = new ol.format.GML3Patched({
                    srsName: map.crs
                });
                break;
            case "text/xml":
            case "application/xml":
                //posible error
                var jqXHR = xml2json(data);
                if (jqXHR.ServiceException)
                    TC.error(jqXHR.ServiceException);
                format = null;
                break;
            default:
                format = null;
                break;
        }
        if (format) {
            return format.readFeatures(jqXHR.responseText, {
                featureProjection: ol.proj.get(map.crs)
            });
        }
        else {
            return null;
            ////si no hay formato reconocido y parseable, metemos un iframe con la respuesta
            ////y prau
            ////para eso, creo una falsa entrada de tipo feature, con un campo especial rawUrl o rawContent
            //var l = service.layers[0];
            //l.features.push({
            //    error: response.responseText
            //});
        }
    };
    var featureToServiceDistributor = function (features, service) {
        var featurePromises = [];
        var featureInsertionPoints = [];
        var isParentOrSame = function (layer, na, nb) {
            var result = false;
            if (na === nb || (na.indexOf(nb) === 0)) {
                result = true;
            }
            else {
                var pa = layer.getPath(na);
                var pb = layer.getPath(nb);
                if (pa.length > 0 && pb.length >= pa.length) {
                    result = true;
                    for (var i = 0; i < pa.length; i++) {
                        if (pa[i] !== pb[i]) {
                            result = false;
                            break;
                        }
                    }
                }
            }
            return result;
        };
        for (var j = 0; j < features.length; j++) {
            var feature = features[j];
            if (feature instanceof ol.Feature) {
                var fid = feature.getId() || TC.getUID();
                var found = false;
                var layerName = fid.substr(0, fid.lastIndexOf('.'));
                for (var k = 0; k < service.layers.length; k++) {
                    var l = service.layers[k];
                    var lName = l.name.substr(l.name.indexOf(':') + 1);
                    if (service.mapLayers.some(function (mapLayer) { return isParentOrSame(mapLayer, lName, layerName) })) {
                        found = true;
                        featurePromises.push(TC.wrap.Feature.createFeature(feature));

                        featureInsertionPoints[feature.id_] = (l.features);
                        break;
                    }
                }

                //si llegamos aqu\u00ed y no he encontrado su layer, es que no cuadraba el prefijo del fid con el id del layer
                //esto pasa, p.ej, en cartociudad
                if (!found) {
                    //as\u00ed que creo un layer de palo para la respuesta del featInfo
                    var fakeLayer;
                    if (fakeLayers[layerName]) fakeLayer = fakeLayers[layerName];
                    else {
                        fakeLayer = {
                            name: layerName, title: layerName, features: []
                        };
                        fakeLayers[layerName] = fakeLayer;
                        service.layers.push(fakeLayer);
                    }

                    if (!opts.featureId || feature.getId() === opts.featureId) { // Mirar si en las opciones pone que solo busque una feature
                        featurePromises.push(TC.wrap.Feature.createFeature(feature));
                        featureInsertionPoints.push(fakeLayer.features);
                    }
                }
            }
        }//iteraci\u00f3n sobre las features de esta respuesta

        return new Promise(function (resolve, reject) {
            Promise.all(featurePromises).then(function (features) {
                features.forEach(function (feat) {
                    feat.attributes = [];
                    //feat.showsPopup = false;
                    for (var key in feat.data) {
                        var value = feat.data[key];
                        if (typeof value !== 'object') {
                            feat.attributes.push({
                                name: key, value: value
                            });
                        }
                    }
                    featureInsertionPoints[feat.id].push(feat);
                });
                resolve({
                    service: service
                })
            });
        });
    }

    TC.wrap.control.GeometryFeatureInfo.prototype.getFeaturesByGeometry = function (feature, xy) {

        var self = this;
        var map = self.parent.map;
        self.parent.filterFeature = feature;
        feature.layer = self.parent.filterLayer;

        map.wrap.getMap().then(function (olMap) {

            var olGeometry = feature.wrap.feature.getGeometry();
            var stride = olGeometry.stride;
            var flatCoordinates = olGeometry.getFlatCoordinates();
            //calcular el punto mas alto
            if (!xy) {
                var bestPoint = null;
                for (var i = 1, len = flatCoordinates.length; i < len; i += stride) {
                    if (!bestPoint || bestPoint[1] < flatCoordinates[i]) {
                        bestPoint = [flatCoordinates[i - 1], flatCoordinates[i]];
                    }
                }
                xy = olMap.getPixelFromCoordinate(new ol.geom.Point(bestPoint).getCoordinates());
            }

            self.parent.beforeRequest({ xy: xy });

            var arrRequests = WFSGetFeatureBuilder(map, new TC.filter.intersects(feature, map.crs !== map.options.crs ? map.crs : undefined), "JSON");

            const arrPromises = [];
            Promise.all(arrRequests).then(function (responses) {
                var targetServices = [];
                var featureCount = 0;
                var hayError = false;

                for (var i = 0; i < responses.length; i++) {
                    const responseObj = responses[i];
                    if (!responseObj) continue;
                    arrPromises[arrPromises.length] = new Promise(function (resolve, reject) {
                        if (responseObj.errors && responseObj.errors.length) {
                            for (var j = 0; j < responseObj.errors.length; j++) {
                                var errorMsg, errorType = TC.Consts.msgType.WARNING;
                                hayError = true;
                                var error = responseObj.errors[j];
                                switch (error.key) {
                                    case TC.Consts.WFSErrors.NumMaxFeatures:
                                        errorMsg = self.parent.getLocaleString("wfs.tooManyFeatures", error.params);
                                        break;
                                        /*case TC.Consts.WFSErrors.NoLayers:
                                            errorMsg = self.parent.getLocaleString('noLayersLoaded');*/
                                        break;
                                    case TC.Consts.WFSErrors.GetCapabilities:
                                        errorMsg = self.parent.getLocaleString('wfsGFI.inValidService', error.params);
                                        break;
                                    case TC.Consts.WFSErrors.NoFeatures:
                                        //si no hay features nos callamos. Quizas en un futuro se muestre una alerta
                                        hayError = false;
                                        continue;
                                        break;
                                    case TC.Consts.WFSErrors.Indeterminate:
                                        errorMsg = self.parent.getLocaleString("wfs.IndeterminateError");
                                        TC.error("Error:{error} \r\n Descripcion:{descripcion} \r\n Servicio:{serviceName}".format({ error: error.params.err, descripcion: error.params.errorThrown, serviceName: error.params.serviceTitle }), TC.Consts.msgErrorMode.CONSOLE);
                                        errorType = TC.Consts.msgType.ERROR;
                                        break;
                                    default:
                                        errorMsg = self.parent.getLocaleString("wfsGFI." + error.key, error.params);
                                        break;
                                }

                                map.toast(errorMsg, { type: errorType });
                            }
                            if (!responseObj.response) {
                                resolve();
                            }
                        }
                    });

                    // Puede no haber response porque la URL no es correcta, metemos un condicional
                    var featuresFound = responses[i].response ? readFeaturesFromResponse(map, responses[i].response[0], responses[i].response[2]) : [];
                    //ahora se distribuye la features por servicio y capa
                    arrPromises[arrPromises.length - 1] = featureToServiceDistributor(featuresFound, responses[i].service);
                    targetServices.push(responses[i].service);
                    featureCount = featureCount + featuresFound.length;
                }
                Promise.all(arrPromises).then(function () {
                    self.parent.responseCallback({
                        xy: xy || null, services: targetServices, featureCount: featureCount
                    });
                });
            }, function (e) {
                self.parent.responseCallback({});
            })
        });
    };

    TC.wrap.control.Popup.prototype = function () {
        this.popup = null;
    };

    TC.Consts.event.PANANIMATIONSTART = 'pananimationstart.tc';
    TC.Consts.event.PANANIMATIONEND = 'pananimationend.tc';
    TC.wrap.control.Popup.prototype.fitToView = function () {
        var self = this;
        var map = self.parent.map;
        var olMap = self.parent.map.wrap.map;

        var popupBoundingRect = self.parent.popupDiv.getBoundingClientRect();
        var mapBoundingRect = map.div.getBoundingClientRect();

        var topLeft = olMap.getCoordinateFromPixel([popupBoundingRect.left - mapBoundingRect.left, popupBoundingRect.top - mapBoundingRect.top]);
        var bottomRight = olMap.getCoordinateFromPixel([popupBoundingRect.right - mapBoundingRect.left, popupBoundingRect.bottom - mapBoundingRect.top]);
        var west = topLeft[0];
        var north = topLeft[1];
        var east = bottomRight[0];
        var south = bottomRight[1];

        var popupExt = [west, south, east, north];
        var mapExt = map.getExtent();

        if (!ol.extent.containsExtent(mapExt, popupExt)) {
            var overflows = {
                left: Math.max(mapExt[0] - popupExt[0], 0),
                bottom: Math.max(mapExt[1] - popupExt[1], 0),
                right: Math.max(popupExt[2] - mapExt[2], 0),
                top: Math.max(popupExt[3] - mapExt[3], 0)
            };

            if (self.parent.dragged) {
                // Movemos el popup
                var newPos = self.popup.getPosition();
                if (overflows.right) {
                    newPos[0] = newPos[0] - overflows.right;
                }
                else if (overflows.left) {
                    newPos[0] = newPos[0] + overflows.left;
                }
                if (overflows.top) {
                    newPos[1] = newPos[1] - overflows.top;
                }
                else if (overflows.bottom) {
                    newPos[1] = newPos[1] + overflows.bottom;
                }
                var newPixelPos = olMap.getPixelFromCoordinate(newPos);
                newPixelPos[1] = olMap.getSize()[1] - newPixelPos[1];
                self.parent._previousContainerPosition = newPixelPos;
                self.popup._oldUpdatePixelPosition(newPos);
            }
            else {
                if (self.parent.isVisible()) {
                    // Movemos el mapa
                    var view = olMap.getView();
                    var ct = view.getCenter().slice();

                    if (overflows.top) ct[1] += overflows.top;
                    else if (overflows.bottom) ct[1] -= overflows.bottom;
                    if (overflows.right) ct[0] += overflows.right;
                    else if (overflows.left) ct[0] -= overflows.left;

                    view.animate({
                        center: ct, easing: function (percent) {
                            if (percent === 0) self.parent.map.trigger(TC.Consts.event.PANANIMATIONSTART);
                            if (percent === 1) self.parent.map.trigger(TC.Consts.event.PANANIMATIONEND);
                            return percent;
                        }
                    });
                }
            }
        }
    };

    TC.wrap.control.Popup.prototype.setDragged = function (dragged) {
        var popup = this.popup;
        //var view = popup.getMap().getView();
        //var onViewChange = function () {
        //    console.log(this.getCenter());
        //};
        if (dragged) {
            // Parcheamos funciones para que el popup no se mueva cuando cambiamos el extent del mapa
            if (!popup._oldUpdatePixelPosition) {
                popup._oldUpdatePixelPosition = popup.updatePixelPosition;
                popup.updatePixelPosition = function () {
                };
            }
            if (!popup._newHandleOffsetChanged) {
                popup._newHandleOffsetChanged = function () {
                    this._oldUpdatePixelPosition();
                };
                ol.events.unlisten(
                    popup, ol.Object.getChangeEventType(ol.Overlay.Property.OFFSET),
                    popup.handleOffsetChanged, popup);
                ol.events.listen(
                    popup, ol.Object.getChangeEventType(ol.Overlay.Property.OFFSET),
                    popup._newHandleOffsetChanged, popup);
            }
            //view.on(['change:center','change:resolution'], onViewChange);
        }
        else {
            // Redefinimos las propiedades de posicionamiento porque al arrastrarlo, las hemos modificado.
            const containerStyle = popup.getElement().parentElement.style;
            containerStyle.setProperty('top', popup.rendered.top_);
            containerStyle.setProperty('bottom', popup.rendered.bottom_);
            containerStyle.setProperty('left', popup.rendered.left_);
            containerStyle.setProperty('right', popup.rendered.right_);

            delete this.parent._previousContainerPosition;
            // Deshacemos parcheo
            if (popup._oldUpdatePixelPosition) {
                popup.updatePixelPosition = popup._oldUpdatePixelPosition;
                delete popup._oldUpdatePixelPosition;
            }
            if (popup._newHandleOffsetChanged) {
                ol.events.unlisten(
                    popup, ol.Object.getChangeEventType(ol.Overlay.Property.OFFSET),
                    popup._newHandleOffsetChanged, popup);
                ol.events.listen(
                    popup, ol.Object.getChangeEventType(ol.Overlay.Property.OFFSET),
                    popup.handleOffsetChanged, popup);
                delete popup._newHandleOffsetChanged;
            }
            //view.un(['change:center', 'change:resolution'], onViewChange);
        }
    };

    TC.wrap.Feature.prototype.getLegend = function () {
        var self = this;
        var result = {
        };
        var style = getNativeStyle(self.feature);
        if (style) {
            var image = style.getImage();
            if (image) {
                if (image instanceof ol.style.Icon) {
                    result.src = image.getSrc();
                    var scale = image.getScale();
                    if (scale) {
                        result.scale = scale;
                        var img = image.getImage();
                        if (img.width) {
                            result.width = img.width * scale;
                            result.height = img.height * scale;
                        }
                    }
                }
                else if (image instanceof ol.style.Circle) {
                    result.src = image.canvas_.toDataURL();
                }
                if (self.parent.options.radius) {
                    result.height = result.width = self.parent.options.radius * 2;
                }
                else {
                    result.width = result.width || self.parent.options.width;
                    result.height = result.height || self.parent.options.height;
                }
            }
            else {
                // No image, find stroke and fill
                var stroke = style.getStroke();
                var fill = style.getFill();
                if (stroke) {
                    var strokeColor = stroke.getColor();
                    if (strokeColor) {
                        result.strokeColor = ol.color.asString(strokeColor);
                    }
                    var strokeWidth = stroke.getWidth();
                    if (strokeWidth) {
                        result.strokeWidth = strokeWidth;
                    }
                }
                if (fill) {
                    var fillColor = fill.getColor();
                    if (fillColor) {
                        result.fillColor = ol.color.asString(fillColor);
                    }
                }
            }
        }

        return result;
    };

    var createNativeFeature = function (coords, geometryConstructor, geometryName) {
        var result;
        var featureOptions = {};
        var gn = geometryName || 'geometry';
        featureOptions[gn] = new geometryConstructor(coords);
        result = new ol.Feature(featureOptions);
        if (geometryName) {
            result.setGeometryName(geometryName);
        }
        return result;
    };

    TC.wrap.Feature.prototype.createPoint = function (coords, options) {
        var self = this;

        if ($.isArray(coords)) {
            self.feature = createNativeFeature(coords, ol.geom.Point, options.geometryName);
        }
        else if (self.isNative(coords)) {
            self.feature = coords;
            self.parent.geometry = coords.getGeometry().getCoordinates();
        }
        self.feature._wrap = self;
        self.feature.setStyle(createNativeStyle({ styles: { point: options } }, self.feature));
        self.setData(self.parent.data);
    };

    TC.wrap.Feature.prototype.createMarker = function (coords, options) {
        var self = this;

        var iconUrl = TC.Util.getPointIconUrl(options);
        if (iconUrl) {
            options.url = iconUrl;
            if ($.isArray(coords)) {
                self.feature = createNativeFeature(coords, ol.geom.Point, options.geometryName);
            }
            else if (self.isNative(coords)) {
                self.feature = coords;
                self.parent.geometry = coords.getGeometry().getCoordinates();
            }
            self.feature._wrap = self;
            self.feature.setStyle(createNativeStyle({ styles: { marker: options } }, self.feature));
            self.setData(self.parent.data);
        }
        else {
            self.createPoint(coords, options);
        }
    };

    TC.wrap.Feature.prototype.createPolyline = function (coords, options) {
        var self = this;

        if ($.isArray(coords)) {
            self.feature = createNativeFeature(coords, ol.geom.LineString, options.geometryName);
        }
        else if (self.isNative(coords)) {
            self.feature = coords;
            self.parent.geometry = coords.getGeometry().getCoordinates();
        }
        self.feature._wrap = self;
        if (options) {
            self.feature.setStyle(createNativeStyle({ styles: { line: options } }, self.feature));
        }
        self.setData(self.parent.data);
    };

    TC.wrap.Feature.prototype.createPolygon = function (coords, options) {
        var self = this;

        if ($.isArray(coords)) {
            if (coords.length) {
                var ringCoords = coords[0];
                if ($.isArray(ringCoords) && ringCoords.length) {
                    var pointCoord = ringCoords[0];
                    if (!$.isArray(pointCoord)) {
                        // anillo solo, lo metemos dentro de un array de anillos
                        coords = [coords];
                    }
                    for (var i = 0; i < coords.length; i++) {
                        ringCoords = coords[i];
                        var startPoint = ringCoords[0];
                        var endPoint = ringCoords[ringCoords.length - 1];
                        if (startPoint[0] !== endPoint[0] || startPoint[1] !== endPoint[1]) {
                            ringCoords[ringCoords.length] = startPoint;
                        }
                        self.parent.geometry = coords;
                        self.feature = createNativeFeature(coords, ol.geom.MultiLineString, options.geometryName);
                    }
                    self.parent.geometry = coords;
                    self.feature = createNativeFeature(coords, ol.geom.Polygon, options.geometryName);
                }
            }
        }
        else if (self.isNative(coords)) {
            self.feature = coords;
            self.parent.geometry = coords.getGeometry().getCoordinates();
        }
        self.feature._wrap = self;
        var opts = options || {};
        if (opts.strokeColor || opts.strokeWidth || opts.fillColor || opts.fillOpacity) {
            self.feature.setStyle(createNativeStyle({ styles: { polygon: opts } }, self.feature));
        }
        self.setData(self.parent.data);
    };


    TC.wrap.Feature.prototype.createMultiPolyline = function (coords, options) {
        var self = this;

        if ($.isArray(coords)) {
            if (coords.length) {
                var plnCoords = coords[0];
                if ($.isArray(plnCoords) && plnCoords.length) {
                    var pointCoord = plnCoords[0];
                    if (!$.isArray(pointCoord)) {
                        // polilínea sola, la metemos dentro de un array de polilíneas
                        coords = [coords];
                    }
                    self.parent.geometry = coords;
                    self.feature = createNativeFeature(coords, ol.geom.MultiLineString, options.geometryName);
                }
            }
        }
        else if (self.isNative(coords)) {
            self.feature = coords;
            self.parent.geometry = coords.getGeometry().getCoordinates();
        }
        self.feature._wrap = self;
        if (options) {
            self.feature.setStyle(createNativeStyle({ styles: { line: options } }, self.feature));
        }
        self.setData(self.parent.data);
    };

    TC.wrap.Feature.prototype.createMultiPolygon = function (coords, options) {
        var self = this;

        if ($.isArray(coords)) {
            if (coords.length) {
                var pgnCoords = coords[0];
                if ($.isArray(pgnCoords) && pgnCoords.length) {
                    var ringCoords = pgnCoords[0];
                    if ($.isArray(ringCoords) && ringCoords.length) {
                        var pointCoord = ringCoords[0];
                        if (!$.isArray(pointCoord)) {
                            // polígono solo, lo metemos dentro de un array de polígonos
                            coords = [coords];
                        }
                    }
                    else {
                        // anillo solo, lo metemos de un array de anillos y este en un array de polígonos
                        coords = [[coords]];
                    }
                    // Close rings
                    for (var i = 0, ii = coords.length; i < ii; i++) {
                        pgnCoords = coords[i];
                        for (var j = 0, jj = pgnCoords.length; j < jj; j++) {
                            ringCoords = pgnCoords[j];
                            var startPoint = ringCoords[0];
                            var endPoint = ringCoords[ringCoords.length - 1];
                            if (startPoint[0] !== endPoint[0] || startPoint[1] !== endPoint[1]) {
                                ringCoords[ringCoords.length] = startPoint;
                            }
                        }
                    }
                    self.parent.geometry = coords;
                    self.feature = createNativeFeature(coords, ol.geom.MultiPolygon, options.geometryName);
                }
            }
        }
        else if (self.isNative(coords)) {
            self.feature = coords;
            self.parent.geometry = coords.getGeometry().getCoordinates();
        }
        self.feature._wrap = self;
        var opts = options || {};
        if (opts.strokeColor || opts.strokeWidth || opts.fillColor || opts.fillOpacity) {
            self.feature.setStyle(createNativeStyle({ styles: { polygon: opts } }, self.feature));
        }
        self.setData(self.parent.data);
    };

    TC.wrap.Feature.prototype.createCircle = function (coords, options) {
        var self = this;

        if ($.isArray(coords) &&
            $.isArray(coords[0])
            && typeof coords[0][0] === 'number' && typeof coords[0][1] === 'number'
            && typeof coords[1] === 'number') {

            var featureOptions = {};
            var geometryName = options.geometryName || 'geometry';
            featureOptions[geometryName] = new ol.geom.Circle(coords[0], coords[1]);
            self.feature = new ol.Feature(featureOptions);
            if (options.geometryName) {
                self.feature.setGeometryName(options.geometryName);
            }
        }
        else if (self.isNative(coords)) {
            self.feature = coords;
            var nativeGeometry = coords.getGeometry();
            self.parent.geometry = [nativeGeometry.getCenter(), nativeGeometry.getRadius()];
        }
        self.feature._wrap = self;
        if (options) {
            self.feature.setStyle(
                new ol.style.Style({
                    stroke: new ol.style.Stroke({
                        color: options.strokeColor,
                        width: options.strokeWidth,
                        lineDash: options.lineDash
                    }),
                    fill: new ol.style.Fill({
                        color: getRGBA(options.fillColor, options.fillOpacity)
                    })
                })
            );
        }
        self.setData(self.parent.data);
    };

    TC.wrap.Feature.createFeature = function (olFeat, options) {
        return new Promise(function (resolve, reject) {
            var olGeometry = olFeat.getGeometry();
            options = options || {};
            options.id = olFeat.getId();

            // geometría
            var geomStr;
            switch (true) {
                case olGeometry instanceof ol.geom.Point:
                    var olStyle = olFeat.getStyle();
                    if ($.isFunction(olStyle)) {
                        olStyle = olStyle.call(olFeat);
                    }
                    var olStyles = olStyle ? ($.isArray(olStyle) ? olStyle : [olStyle]) : [];
                    for (var i = 0, len = olStyles.length; i < len; i++) {
                        olStyle = olStyles[i];
                        if (olStyle.getImage() instanceof ol.style.Icon) {
                            geomStr = 'Marker';
                            break;
                        }
                    }
                    geomStr = geomStr || 'Point';
                    break;
                case olGeometry instanceof ol.geom.LineString:
                    geomStr = 'Polyline';
                    break;
                case olGeometry instanceof ol.geom.Polygon:
                    geomStr = 'Polygon';
                    break;
                case olGeometry instanceof ol.geom.MultiLineString:
                    geomStr = 'MultiPolyline';
                    break;
                case olGeometry instanceof ol.geom.MultiPolygon:
                    geomStr = 'MultiPolygon';
                    break;
                default:
                    break;
            }
            if (geomStr) {
                TC.loadJS(
                    !TC.feature || (TC.feature && !TC.feature[geomStr]),
                    [TC.apiLocation + 'TC/feature/' + geomStr],
                    function () {
                        var feat = new TC.feature[geomStr](olFeat, options);
                        feat.data = feat.wrap.getData();
                        resolve(feat);
                    }
                );
            }
            else {
                TC.loadJS(
                    !TC.Feature,
                    [TC.apiLocation + 'TC/Feature'],
                    function () {
                        var feat = new TC.Feature(olFeat, options);
                        feat.data = feat.wrap.getData();
                        resolve(feat);
                    }
                );
            }
        });
    };

    TC.wrap.Feature.prototype.cloneFeature = function () {
        return this.feature.clone();
    };

    TC.wrap.Feature.prototype.getStyle = function () {
        var self = this;
        var result = {};
        var olStyle = self.feature.getStyle();
        if ($.isFunction(olStyle)) {
            olStyle = olStyle.call(self.feature);
        }
        var olStyles = olStyle ? ($.isArray(olStyle) ? olStyle : [olStyle]) : [];

        const getFill = function (style, obj) {
            if (style) {
                const fill = style.getFill();
                if (fill) {
                    obj.fillColor = fill.getColor();
                    if ($.isArray(obj.fillColor)) {
                        obj.fillOpacity = obj.fillColor[3];
                    }
                }
            }
        };
        const getStroke = function (style, obj) {
            if (style) {
                const stroke = style.getStroke();
                if (stroke) {
                    obj.strokeColor = stroke.getColor();
                    obj.strokeWidth = stroke.getWidth();
                }
            }
        };

        for (var i = 0, len = olStyles.length; i < len; i++) {
            olStyle = olStyles[i];
            getFill(olStyle, result);
            getStroke(olStyle, result);
            const image = olStyle.getImage();
            if (image instanceof ol.style.Icon) {
                result.url = image.getSrc();
                const size = image.getSize();
                const scale = image.getScale() || 1;
                if (size) {
                    result.width = size[0] * scale;
                    result.height = size[1] * scale;
                }
                var anchor = image.getAnchor();
                if (anchor) {
                    result.anchor = [anchor[0] * scale, anchor[1] * scale];
                    if (size) {
                        // getAnchor devuelve los valores en pixels, hay que transformar a fracción
                        result.anchor[0] = result.anchor[0] / result.width;
                        result.anchor[1] = result.anchor[1] / result.height;
                    }
                }
            }
            else {
                getFill(image, result);
                getStroke(image, result);
            }
            var text = olStyle.getText();
            if (text) {
                result.label = text.getText();
                var font = text.getFont();
                if (font) {
                    // A 96dpi 3pt = 4px
                    result.fontSize = parseInt(font.match(/\d+pt/)) || parseInt(font.match(/\d+px/)) * 0.75;
                }
                var rotation = text.getRotation();
                if (rotation) {
                    result.angle = -180 * rotation / Math.PI;
                }
                result.labelOffset = [text.getOffsetX(), text.getOffsetY()];
                fill = text.getFill();
                if (fill) {
                    result.fontColor = fill.getColor();
                }
                stroke = text.getStroke();
                if (stroke) {
                    result.labelOutlineColor = stroke.getColor();
                    result.labelOutlineWidth = stroke.getWidth();
                }
            }
        }
        $.extend(self.parent.options, result);
        return result;
    };

    TC.wrap.Feature.prototype.getGeometry = function () {
        var result;
        var self = this;
        if (self.feature && self.feature.getGeometry) {
            var geom = self.feature.getGeometry();
            if (geom) {
                if (geom.getCoordinates) {
                    result = geom.getCoordinates();
                }
                else if (geom instanceof ol.geom.Circle) {
                    result = [geom.getCenter(), geom.getRadius()];
                }
            }
        }
        return result;
    };

    TC.wrap.Feature.prototype.setGeometry = function (geometry) {
        var result = false;
        var self = this;
        if (self.feature && self.feature.getGeometry) {
            var geom = self.feature.getGeometry();
            var point,
                points,
                ringsOrPolylines,
                polygons,
                isMultiPolygon,
                isPolygonOrLineString,
                isLineString;
            // punto: array de números
            // línea o anillo: array de puntos
            // multilínea o polígono: array de líneas o anillos
            // multipolígono: array de polígonos
            // Por tanto podemos recorrer los tipos en un switch sin breaks
            switch (true) {
                case (geom instanceof ol.geom.MultiPolygon):
                    isMultiPolygon = true;
                    polygons = geometry;
                    if ($.isArray(polygons)) {
                        ringsOrPolylines = geometry[0];
                    }
                case (geom instanceof ol.geom.Polygon || geom instanceof ol.geom.MultiLineString):
                    isPolygonOrLineString = true;
                    ringsOrPolylines = isMultiPolygon ? ringsOrPolylines : geometry;
                    if ($.isArray(ringsOrPolylines)) {
                        points = ringsOrPolylines[0];
                    }
                case (geom instanceof ol.geom.LineString):
                    isLineString = true;
                    points = isPolygonOrLineString ? points : geometry;
                    if ($.isArray(points)) {
                        point = points[0];
                    }
                case (geom instanceof ol.geom.Point):
                    point = isLineString ? point : geometry;
                    if ($.isArray(point) && typeof point[0] === 'number' && typeof point[1] === 'number') {
                        var layout;
                        switch (point.length) {
                            case 3:
                                layout = ol.geom.GeometryLayout.XYZ;
                                break;
                            case 4:
                                layout = ol.geom.GeometryLayout.XYZM;
                                break;
                            default:
                                layout = ol.geom.GeometryLayout.XY;
                                break;
                        }
                        geom.setCoordinates(geometry, layout);
                        result = true;
                    }
                    break;
                case (geom instanceof ol.geom.Circle):
                    if ($.isArray(geometry) &&
                        $.isArray(geometry[0])
                        && typeof geometry[0][0] === 'number' && typeof geometry[0][1] === 'number'
                        && typeof geometry[1] === 'number') {
                        geom.setCenterAndRadius(geometry[0], geometry[1]);
                        result = true;
                    }
                    break;
            }
        }
        return result;
    };

    TC.wrap.Feature.prototype.getId = function () {
        var result;
        var self = this;
        if (self.feature) {
            result = self.feature.getId();
        };
        return result;
    };

    TC.wrap.Feature.prototype.setId = function (id) {
        var self = this;
        if (self.feature) {
            self.feature.setId(id);
        };
    };

    const getPolygonLength = function (polygon, options) {
        const self = this;
        var result = 0;
        polygon.getLinearRings().forEach(function (ring) {
            coordinates = ring.getCoordinates();
            if (options.crs) {
                coordinates = TC.Util.reproject(coordinates, self.parent.layer.map.crs, options.crs);
            }
            const polygon = new ol.geom.Polygon([coordinates]);
            const newRing = polygon.getLinearRing(0);
            result = result + ol.geom.flat.length.linearRing(newRing.flatCoordinates, 0, newRing.flatCoordinates.length, newRing.stride);
        });
        return result;
    };

    const getLineStringLength = function (lineString, options) {
        const self = this;
        coordinates = lineString.getCoordinates();
        if (options.crs) {
            coordinates = TC.Util.reproject(coordinates, self.parent.layer.map.crs, options.crs);
        }
        const line = new ol.geom.LineString(coordinates);
        return line.getLength();
    };

    TC.wrap.Feature.prototype.getLength = function (options) {
        const self = this;
        options = options || {};
        var result = 0;

        const geom = self.feature.getGeometry();
        var coordinates;
        switch (true) {
            case geom instanceof ol.geom.Polygon:
                result = getPolygonLength.call(self, geom, options);
                break;
            case geom instanceof ol.geom.LineString:
                result = getLineStringLength.call(self, geom, options);
                break;
            case geom instanceof ol.geom.MultiPolygon:
                geom.getPolygons().forEach(function (polygon) {
                    result = result + getPolygonLength.call(self, polygon, options);
                });
                break;
            case geom instanceof ol.geom.MultiPolygon:
                geom.getLineStrings().forEach(function (lineString) {
                    result = result + getLineStringLength.call(self, lineString, options);
                });
                break;
        }

        return result;
    };

    TC.wrap.Feature.prototype.getArea = function (options) {
        const self = this;
        options = options || {};

        const geom = self.feature.getGeometry();
        var coordinates;
        if (geom instanceof ol.geom.Polygon) {
            coordinates = geom.getLinearRing(0).getCoordinates();
            if (options.crs) {
                coordinates = TC.Util.reproject(coordinates, self.parent.layer.map.crs, options.crs);
            }
            const polygon = new ol.geom.Polygon([coordinates]);
            return polygon.getArea();
        }
    };

    const getFeatureStyle = function (readonly) {
        var style = this.getStyle();
        if ($.isFunction(style)) {
            style = style.call(this);
        }
        if ($.isArray(style)) {
            style = style[style.length - 1];
        }
        if (!style && !readonly) {
            style = new ol.style.Style();
            this.setStyle(style);
        }
        return style;
    };

    const getLayerStyle = function (feature) {
        var style = this.getStyle();
        if ($.isFunction(style)) {
            style = style(feature);
        }
        if ($.isArray(style)) {
            style = style[style.length - 1];
        }
        if (!style) {
            style = new ol.style.Style();
        }
        return style;
    };

    TC.wrap.Feature.prototype.setStyle = function (options) {
        const self = this;
        const olFeat = self.feature;
        if (options === null) {
            olFeat.setStyle(null);
            return;
        }
        const feature = self.parent;
        const geom = olFeat.getGeometry();
        var style = getFeatureStyle.call(olFeat);
        var layerStyle;
        if (feature.layer) {
            layerStyle = getLayerStyle.call(feature.layer.wrap.layer, feature.wrap.feature);
        }
        if (geom instanceof ol.geom.Point || geom instanceof ol.geom.MultiPoint) {

            var imageStyle;
            if (options.anchor || options.url || options.cssClass) { // Marcador
                imageStyle = style.getImage();
                const iconOptions = {};
                if (imageStyle instanceof ol.style.Icon) {
                    iconOptions.src = options.url || TC.Util.getBackgroundUrlFromCss(options.cssClass) || imageStyle.getSrc();

                    if (options.width && options.height) {
                        iconOptions.size = [getStyleValue(options.width, feature), getStyleValue(options.height, feature)];
                    }
                    else {
                        iconOptions.size = imageStyle.getSize();
                    }
                    iconOptions.anchor = getStyleValue(options.anchor, feature) || imageStyle.getAnchor().map(function (elm, idx) {
                        return elm / iconOptions.size[idx];
                    });
                }
                else {
                    iconOptions.src = TC.Util.getPointIconUrl(options);
                    iconOptions.anchor = getStyleValue(options.anchor, feature);
                    iconOptions.size = [getStyleValue(options.width, feature), getStyleValue(options.height, feature)];
                };
                if (options.angle) {
                    iconOptions.angle = options.angle;
                }

                imageStyle = new ol.style.Icon(iconOptions);
            }
            else if (!(style.getImage()) && style.getText()) { // Etiqueta

                if (options.label !== undefined) {
                    style = getFeatureStyle.call(olFeat);
                    if (options.label.length) {
                        style.setText(createNativeTextStyle(options, feature));
                    }
                    else {
                        style.setText();
                    }
                } else {
                    style.setText();
                }
            }
            else { // Punto sin icono
                imageStyle = style.getImage();
                if (!imageStyle) {
                    imageStyle = new ol.style.Circle();
                }
                const circleOptions = {
                    radius: getStyleValue(options.radius, feature) ||
                    (getStyleValue(options.height, feature) + getStyleValue(options.width, feature)) / 4
                };
                if (isNaN(circleOptions.radius)) {
                    circleOptions.radius = imageStyle.getRadius();
                }
                if (options.fillColor) {
                    circleOptions.fill = new ol.style.Fill({
                        color: getRGBA(getStyleValue(options.fillColor, feature), getStyleValue(options.fillOpacity, feature))
                    });
                }
                else {
                    circleOptions.fill = imageStyle.getFill();
                }
                circleOptions.stroke = imageStyle.getStroke();
                const layerStroke = layerStyle && layerStyle.getStroke();
                if (options.strokeColor || options.strokeWidth) {
                    if (!circleOptions.stroke) {
                        circleOptions.stroke = new ol.style.Stroke();
                    }
                    if (options.strokeColor) {
                        circleOptions.stroke.setColor(getStyleValue(options.strokeColor, feature));
                    }
                    else {
                        const strokeColor = circleOptions.stroke.getColor() || (layerStroke && layerStroke.getColor() || TC.Cfg.styles.point.strokeColor);
                        circleOptions.stroke.setColor(getStyleValue(strokeColor, feature));
                    }
                    if (options.strokeWidth) {
                        circleOptions.stroke.setWidth(getStyleValue(options.strokeWidth, feature));
                    }
                    else {
                        const strokeWidth = circleOptions.stroke.getWidth() || (layerStroke && layerStroke.getWidth() || TC.Cfg.styles.point.strokeWidth);
                        circleOptions.stroke.setWidth(getStyleValue(strokeWidth, feature));
                    }
                }
                imageStyle = new ol.style.Circle(circleOptions);
            }
            style.setImage(imageStyle);
        }
        else {
            var stroke = style.getStroke();
            var strokeChanged = false;
            if (!stroke) {
                stroke = new ol.style.Stroke();
            }
            if (options.strokeColor) {
                stroke.setColor(getStyleValue(options.strokeColor, feature));
                strokeChanged = true;
            }
            if (options.strokeWidth) {
                stroke.setWidth(getStyleValue(options.strokeWidth, feature));
                strokeChanged = true;
                style.setStroke(stroke);
            }
            if (options.lineDash) {
                stroke.setLineDash(options.lineDash)
                strokeChanged = true;
                style.setStroke(stroke);
            }
            if (strokeChanged) {
                style.setStroke(stroke);
            }
            if (geom instanceof ol.geom.Polygon || geom instanceof ol.geom.MultiPolygon) {
                if (options.fillColor || options.fillOpacity) {
                    var fill = style.getFill() || new ol.style.Fill();
                    fill.setColor(getRGBA(getStyleValue(options.fillColor, feature), getStyleValue(options.fillOpacity, feature)));
                    style.setFill(fill);
                }
            }
        }

        if (options.label !== undefined) {
            style = getFeatureStyle.call(olFeat);
            if (options.label.length) {
                style.setText(createNativeTextStyle(options, feature));
            }
            else {
                style.setText();
            }
        }

        olFeat.changed();
    };

    TC.wrap.Feature.prototype.toggleSelectedStyle = function (condition) {
        const self = this;
        const feature = self.feature;
        const setStyle = condition === undefined ? !feature._originalStyle : condition;
        if (setStyle) {
            setSelectedStyle(feature);
        }
        else {
            removeSelectedStyle(feature);
        }
    };

    TC.wrap.Feature.prototype.getInnerPoint = function (options) {
        var result;
        var opts = options || {};
        // Funciones para hacer clipping con el extent actual. Así nos aseguramos de que el popup sale en un punto visible actualmente.
        var feature = this.feature;
        var geometry = feature.getGeometry();

        var clipCoord = function (coord) {
            var clipBox = opts.clipBox;
            coord[0] = Math.min(Math.max(coord[0], clipBox[0]), clipBox[2]);
            coord[1] = Math.min(Math.max(coord[1], clipBox[1]), clipBox[3]);
        };
        var clipGeometry = function clipGeometry(geom) {
            if (opts.clipBox) {
                if ($.isArray(geom)) {
                    if ($.isArray(geom[0])) {
                        for (var i = 0, len = geom.length; i < len; i++) {
                            clipGeometry(geom[i]);
                        }
                    }
                    else {
                        clipCoord(geom);
                    }
                }
            }
        };

        result = geometry.getFirstCoordinate();
        switch (geometry.getType()) {
            case ol.geom.GeometryType.MULTI_POLYGON:
                var area = 0;
                geometry = geometry.getPolygons().reduce(function (prev, cur) {
                    const curArea = cur.getArea();
                    const result = curArea > area ? cur : prev;
                    area = curArea;
                    return result;
                });
            case ol.geom.GeometryType.POLYGON:
                var isInsideRing = function (point, ring) {
                    var result = false;
                    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
                        var xi = ring[i][0], yi = ring[i][1];
                        var xj = ring[j][0], yj = ring[j][1];
                        var intersect = ((yi > point[1]) != (yj > point[1])) &&
                            (point[0] < (xj - xi) * (point[1] - yi) / (yj - yi) + xi);
                        if (intersect) result = !result;
                    }
                    return result;
                };
                var coords = geometry.getCoordinates();
                clipGeometry(coords);
                geometry = new ol.geom.Polygon(coords);
                result = geometry.getInteriorPoint().getCoordinates();
                var rings = geometry.getLinearRings();
                // Miramos si el punto está dentro de un agujero
                for (var i = 1; i < rings.length; i++) {
                    if (isInsideRing(result, rings[i].getCoordinates())) {
                        result = geometry.getClosestPoint(result);
                        break;
                    }
                }
                break;
            case ol.geom.GeometryType.MULTI_LINE_STRING:
                var length = 0;
                geometry = geometry.getLineStrings().reduce(function (prev, cur) {
                    const curLength = cur.getLength();
                    const result = curLength > length ? cur : prev;
                    length = curLength;
                    return result;
                });
            case ol.geom.GeometryType.LINE_STRING:
                var centroid = [0, 0];
                var coords = geometry.getCoordinates();
                clipGeometry(coords);
                geometry = new ol.geom.LineString(coords);
                for (var i = 0; i < coords.length; i++) {
                    centroid[0] += coords[i][0];
                    centroid[1] += coords[i][1];
                }
                centroid[0] /= coords.length;
                centroid[1] /= coords.length;
                result = geometry.getClosestPoint(centroid);
                break;
            default:
                break;
        }
        return result;
    };

    TC.wrap.Feature.prototype.showPopup = function (popupCtl) {
        var self = this;
        var map = popupCtl.map;

        if (map) {
            var feature = self.feature;
            if (feature) {
                map.currentFeature = self.parent;
                var currentExtent = map.getExtent();

                self._innerCentroid = self.getInnerPoint({ clipBox: currentExtent });

                popupCtl.contentDiv.innerHTML = self.parent.getInfo({ locale: map.options.locale });
                popupCtl.menuDiv.innerHTML = '';
                if (popupCtl.options.closeButton || popupCtl.options.closeButton === undefined) {
                    const btn = document.createElement('div');
                    btn.classList.add(popupCtl.CLASS + '-close');
                    btn.setAttribute('title', popupCtl.getLocaleString('close'));
                    popupCtl.menuDiv.appendChild(btn);
                    btn.addEventListener(TC.Consts.event.CLICK, function () {
                        popupCtl.hide();
                    });
                    popupCtl.contentDiv.classList.add(popupCtl.CLASS + '-has-btn');
                    // En OL2 los featureInfo en versión "baraja de cartas" salen sin tamaño.
                    // Para evitar esto, la clase tc-ctl-finfo tiene ancho y alto establecidos.
                    // Pero eso hace que en el popup salgan barras de scroll, porque contentDiv se crea demasiado pequeño.
                    // Rehacemos el tamaño de tc-ctl-finfo para eliminarlas.
                    const finfo = popupCtl.contentDiv.querySelector('.tc-ctl-finfo');
                    if (finfo) {
                        finfo.width = 'auto';
                        finfo.height = 'auto';
                    }
                }

                var options = self.parent.options;
                if (TC.Util.isEmptyObject(options) && self.parent.layer &&
                    self.parent.layer.options && self.parent.layer.options.styles) {

                    switch (self.parent.CLASSNAME) {
                        case "TC.feature.Point":
                            options = self.parent.layer.options.styles.point;

                            // 11/03/2019 Al crear las features del API desde las features nativas, 
                            // se valida si la feature tiene icono para definir si es punto o marcador
                            // el problema viene cuando la feature no tiene estilo propio sino que lo obtiene de la capa,
                            // en esos casos se define como punto lo que es un marcador y cuando llegamos aquí no se accede a las
                            // opciones de marcador sino de punto.
                            if (!options || TC.Util.isEmptyObject(options)) {
                                options = self.parent.layer.options.styles.marker;
                            }
                            break;
                        case "TC.feature.Marker":
                            options = self.parent.layer.options.styles.marker;
                            break;
                        case "TC.feature.Circle":
                            options = self.parent.layer.options.styles.circle;
                            break;
                        case "TC.feature.MultiPolygon":
                        case "TC.feature.Polygon":
                            options = self.parent.layer.options.styles.polygon;
                            break;
                        case "TC.feature.MultiPolyline":
                        case "TC.feature.Polyline":
                            options = self.parent.layer.options.styles.line;
                            break;
                    }
                }

                // Calcular anchor
                var anchor;
                if (options.anchor) {
                    anchor = options.anchor;
                }
                else {
                    var style;
                    var f = feature._wrap.parent;
                    for (var i = 0; i < map.workLayers.length; i++) {
                        var layer = map.workLayers[i];
                        if (!layer.isRaster()) {
                            if ($.inArray(f, layer.features) >= 0) {
                                style = layer.wrap.styleFunction(feature);
                                break;
                            }
                        }
                    }
                    if ($.isArray(style)) {
                        const image = style[0].getImage();
                        anchor = !image || image instanceof ol.style.Icon ? [0.5, 0] : [0.5, 0.5];
                    }
                }
                const offset = [0, 0];
                if (anchor) {
                    if (options.height) {
                        offset[1] = -options.height * anchor[1];
                    }
                    else {
                        var fStyle = getFeatureStyle.call(feature, true);
                        if (fStyle) {
                            const image = fStyle.getImage();
                            if (image instanceof ol.style.Icon) {
                                offset[1] = image.getImageSize()[1] * -image.getScale();
                            }
                        }
                    }
                }

                popupCtl.wrap.setDragged(false);
                popupCtl.wrap.popup.setOffset(offset);
                popupCtl.wrap.popup.setPosition(self._innerCentroid);
                popupCtl.popupDiv.classList.add(TC.Consts.classes.VISIBLE);
            }
            else {
                map.wrap.hidePopup(popupCtl);
            }
        }
    };

    TC.wrap.Feature.prototype.isNative = function (feature) {
        return feature instanceof ol.Feature;
    };

    TC.wrap.Feature.prototype.getPath = function () {
        var result = [];
        var self = this;
        if (self.feature && self.feature._folders) {
            result = self.feature._folders;
        }
        return result;
    };

    TC.wrap.Feature.prototype.getBounds = function () {
        var result = null;
        var self = this;
        if (self.feature) {
            result = self.feature.getGeometry().getExtent();
        }
        return result;
    };

    TC.wrap.Feature.prototype.getTemplate = function () {
        var result = null;
        var self = this;
        var style = self.feature.getStyle();
        if (typeof style === 'function') {
            style = style.call(self.feature);
        }
        if ($.isArray(style)) {
            for (var i = 0; i < style.length; i++) {
                if (style[i]._balloon) {
                    var s = style[i]._balloon.getText();
                    if (s) {
                        style = style[i]._balloon;
                        break;
                    }
                }
            }
        }
        if (style && !$.isArray(style) && style.getText) {
            result = style.getText();
        }
        return result;
    };

    TC.wrap.Feature.prototype.getData = function () {
        var self = this;
        var result = self.feature.getProperties();
        // En caso de clusters
        if ($.isArray(result.features)) {
            if (result.features.length === 1) {
                result = result.features[0].getProperties();
            }
            else {
                result = result.features.length + ' elementos';
            }
        }
        var geometryName = self.feature.getGeometryName();
        if (result[geometryName]) {
            delete result[geometryName];
        }
        return result;
    };

    TC.wrap.Feature.prototype.setData = function (data) {
        this.feature.setProperties(data);
    };

    TC.wrap.Feature.prototype.clearData = function () {
        const feature = this.feature;
        const geometryName = feature.getGeometryName();
        feature.getKeys().forEach(function (key) {
            if (key !== geometryName) {
                feature.unset(key);
            }
        });
    };

    TC.wrap.control.Draw.prototype.mouseMoveHandler = function (evt) {
        const self = this;
        if (self.sketch) {
            self.parent.trigger(TC.Consts.event.MEASUREPARTIAL, self.getMeasureData());
        }
    };

    TC.wrap.control.Draw.prototype.mouseOverHandler = function (evt) {
        const self = this;
        if (self.sketch && self.hoverCoordinate) {
            self.pushCoordinate(self.hoverCoordinate);
            self.hoverCoordinate = null;
        }
    };

    TC.wrap.control.Draw.prototype.clickHandler = function (evt) {
        const self = this;
        if (self.parent.map.view === TC.Consts.view.PRINTING) {
            return;
        }
        if (self._mdPx) { // No operamos si el clic es consecuencia es en realidad un drag
            const dx = self._mdPx[0] - evt.clientX;
            const dy = self._mdPx[1] - evt.clientY;
            if (dx * dx + dy * dy > self.interaction.squaredClickTolerance_) {
                return;
            }
        }
        if (self.sketch) {
            var coords = self.sketch.getGeometry().getCoordinates();
            self.parent.trigger(TC.Consts.event.POINT, {
                point: coords[coords.length - 1]
            });
        }
    };

    TC.wrap.control.Draw.prototype.mousedownHandler = function (evt) {
        const self = this;
        self._mdPx = [evt.clientX, evt.clientY];
    };

    TC.wrap.control.Draw.prototype.getMeasureData = function () {
        var self = this;

        var formatLength = function (line, data) {
            line = new ol.geom.LineString(TC.Util.reproject(line.getCoordinates(), self.parent.map.crs, self.parent.map.options.utmCrs));
            data.length = line.getLength();
        };

        var formatArea = function (polygon, data) {
            polygon = new ol.geom.Polygon([TC.Util.reproject(polygon.getLinearRing(0).getCoordinates(), self.parent.map.crs, self.parent.map.options.utmCrs)]);
            data.area = polygon.getArea();
            var ring = polygon.getLinearRing(0);
            data.perimeter = ol.geom.flat.length.linearRing(ring.flatCoordinates, 0, ring.flatCoordinates.length, ring.stride);
        };

        var result = {
            units: ol.proj.Units.METERS
        };
        if (this.sketch) {
            var geom = (this.sketch.getGeometry());
            if (geom instanceof ol.geom.Polygon) {
                formatArea(geom, result);
            }
            else if (geom instanceof ol.geom.LineString) {
                formatLength(geom, result);
            }
        }

        return result;
    };

    // Función para reproyectar el dibujo actual
    const drawProjectionChangeHandler = function (ctl, e) {
        if (ctl.sketch) {
            const oldProj = e.oldValue.getProjection();
            const newProj = e.target.get(e.key).getProjection();
            if (oldProj.getCode() !== newProj.getCode()) {
                const geom = ctl.sketch.getGeometry();
                geom.transform(oldProj, newProj);
                ctl.interaction.sketchPoint_.getGeometry().transform(oldProj, newProj);
                const flatCoordinates = [];
                var sketchCoords;
                if (ctl.interaction.mode_ === ol.interaction.Draw.Mode_.POLYGON) {
                    sketchCoords = ctl.interaction.sketchCoords_[0];
                }
                else {
                    sketchCoords = ctl.interaction.sketchCoords_;
                }
                ol.geom.flat.deflate.coordinates(flatCoordinates, 0, sketchCoords, geom.stride);
                const transformFn = ol.proj.getTransform(oldProj, newProj);
                transformFn(flatCoordinates, flatCoordinates, geom.stride);
                sketchCoords = ol.geom.flat.inflate.coordinates(flatCoordinates, 0, flatCoordinates.length, geom.stride);
                if (ctl.interaction.mode_ === ol.interaction.Draw.Mode_.POLYGON) {
                    ctl.interaction.sketchCoords_ = [sketchCoords];
                }
                else {
                    ctl.interaction.sketchCoords_ = sketchCoords;
                }
            }
        }
    };

    TC.wrap.control.Draw.prototype.activate = function (mode) {
        var self = this;

        var type;
        switch (mode) {
            case TC.Consts.geom.POLYGON:
                type = ol.geom.GeometryType.POLYGON;
                break;
            case TC.Consts.geom.POINT:
                type = ol.geom.GeometryType.POINT;
                break;
            default:
                type = ol.geom.GeometryType.LINE_STRING;
                break;
        }
        if (self.parent.map) {
            Promise.all([self.parent.map.wrap.getMap(), self.parent.getLayer()]).then(function (objects) {
                const olMap = objects[0];
                const layer = objects[1];
                if (layer) {
                    layer.wrap.getLayer().then(function (olLayer) {

                        if (!self.viewport) self.viewport = olMap.getViewport();

                        if (self.interaction) {
                            olMap.removeInteraction(self.interaction);
                            if (self._mousedownHandler) {
                                self.viewport.removeEventListener('mousedown', self._mousedownHandler);
                                self._mousedownHandler = null;
                            }
                            if (self._clickHandler) {
                                self.viewport.removeEventListener(TC.Consts.event.CLICK, self._clickHandler);
                                self._clickHandler = null;
                            }
                            if (self._mouseMoveHandler && self._mouseOverHandler) {
                                self.viewport.removeEventListener(MOUSEMOVE, self._mouseMoveHandler);
                                self.viewport.removeEventListener(MOUSEOVER, self._mouseOverHandler);
                            }
                        }

                        if (self.snapInteraction) {
                            olMap.removeInteraction(self.snapInteraction);
                        }

                        if (mode) {
                            self._mousedownHandler = $.proxy(self.mousedownHandler, self);
                            self._clickHandler = $.proxy(self.clickHandler, self);
                            self.viewport.addEventListener('mousedown', self._mousedownHandler);
                            self.viewport.addEventListener(TC.Consts.event.CLICK, self._clickHandler);
                            if (self.parent.measure) {
                                self._mouseMoveHandler = self.mouseMoveHandler.bind(self);
                                self._mouseOverHandler = self.mouseOverHandler.bind(self);
                                self.viewport.addEventListener(MOUSEMOVE, self._mouseMoveHandler);
                                self.viewport.addEventListener(MOUSEOVER, self._mouseOverHandler);
                            }

                            var drawOptions = {
                                type: type,
                                snapTolerance: 0,
                                condition: function () {
                                    if (ol.events.condition.shiftKeyOnly(arguments[0])) {
                                        hole = olMap.forEachFeatureAtPixel(olMap.getPixelFromCoordinate(arguments[0].coordinate), function (feature) {
                                            if (ol.geom.GeometryType.POLYGON == feature.getGeometry().getType() ||
                                                ol.geom.GeometryType.MULTI_POLYGON == feature.getGeometry().getType()) {
                                                return feature;
                                            }
                                            return null;
                                        },
                                            {
                                                hitTolerance: hitTolerance
                                            });
                                    }

                                    if (self.parent.map.view === TC.Consts.view.PRINTING) {
                                        return null;
                                    }

                                    return true;
                                }
                            };
                            if (olLayer) {
                                drawOptions.source = olLayer.getSource();
                            }
                            switch (mode) {
                                case TC.Consts.geom.RECTANGLE:
                                    drawOptions.style = createNativeStyle({
                                        styles: { line: self.parent.styles.line }
                                    });
                                    drawOptions.type = ol.geom.GeometryType.LINE_STRING;
                                    drawOptions.maxPoints = 2;
                                    drawOptions.geometryFunction = function (coordinates, geometry) {
                                        if (!geometry) {
                                            geometry = new ol.geom.Polygon(null);
                                        }
                                        var start = coordinates[0];
                                        var end = coordinates[1];
                                        geometry.setCoordinates([
                                            [start, [start[0], end[1]], end, [end[0], start[1]], start]
                                        ]);
                                        return geometry;
                                    };
                                    break;
                                case TC.Consts.geom.POLYGON:
                                    drawOptions.style = createNativeStyle({
                                        styles: { polygon: self.parent.styles.polygon }
                                    });
                                    break;
                                case TC.Consts.geom.POINT:
                                    drawOptions.style = createNativeStyle({
                                        styles: { point: self.parent.styles.point }
                                    });
                                    break;
                                default:
                                    drawOptions.style = createNativeStyle({
                                        styles: { line: self.parent.styles.line }
                                    });
                                    break;
                            }

                            self.interaction = new ol.interaction.Draw(drawOptions);

                            self.interaction.on(ol.interaction.DrawEventType.DRAWSTART, function (evt) {
                                self.sketch = evt.feature;
                                self.parent.trigger(TC.Consts.event.DRAWSTART);
                            }, this);

                            self.interaction.on(ol.interaction.DrawEventType.DRAWEND, function (evt) {
                                evt.feature.setStyle(evt.target.overlay_.getStyle().map(function (style) {
                                    return style.clone();
                                }));
                                if (self.parent.measure) {
                                    self.parent.trigger(TC.Consts.event.MEASURE, self.getMeasureData());
                                }
                                createFeatureFromNative(self.sketch).then(function (feat) {
                                    self.parent.trigger(TC.Consts.event.DRAWEND, { feature: feat });
                                    self.sketch = null;
                                });
                            }, this);

                            self._projectionChangeHandler = function (e) {
                                drawProjectionChangeHandler(self, e);
                            };
                            olMap.on('change:view', self._projectionChangeHandler);

                            olMap.addInteraction(self.interaction);

                            if (self.parent.snapping) {
                                var snapOptions = {};
                                if (olLayer) {
                                    snapOptions.source = olLayer.getSource();
                                }
                                else if (self.parent.snapping instanceof TC.Layer) {
                                    snapOptions.source = self.parent.snapping.wrap.layer.getSource();
                                }
                                self.snapInteraction = new ol.interaction.Snap(snapOptions);
                                olMap.addInteraction(self.snapInteraction);
                            }
                        }

                        self.redoStack = [];
                    });
                }
            });
        }
    };

    TC.wrap.control.Draw.prototype.deactivate = function () {
        var self = this;
        if (self.parent.map) {
            Promise.all([self.parent.map.wrap.getMap(), self.parent.getLayer()]).then(function (objects) {
                const olMap = objects[0];
                const layer = objects[1];
                if (self.viewport) {
                    if (self._mousedownHandler) {
                        self.viewport.removeEventListener('mousedown', self._mousedownHandler);
                        self._mousedownHandler = null;
                    }
                    if (self._clickHandler) {
                        self.viewport.removeEventListener(TC.Consts.event.CLICK, self._clickHandler);
                        self._clickHandler = null;
                    }
                }
                if (layer && !self.parent.persistent) {
                    layer.clearFeatures();
                }
                if (self.interaction) {
                    olMap.removeInteraction(self.interaction);
                    self.interaction = null;
                }
                olMap.un('change:view', self._projectionChangeHandler);
            });
        }
    };

    //El valor devuelto es lo que va al stack de redo
    TC.wrap.control.Draw.prototype.popCoordinate = function () {
        var self = this;
        var result = null;
        if (self.interaction) {
            var feature = self.interaction.sketchFeature_;
            if (feature) {
                var coords;
                var geom = feature.getGeometry();

                if (geom instanceof ol.geom.Polygon) {
                    coords = geom.getCoordinates()[0];
                }
                else if (geom instanceof ol.geom.LineString) {
                    coords = geom.getCoordinates();
                }
                var fullCoords = coords;
                if (coords.length > 1) {

                    var puntos;
                    if (geom instanceof ol.geom.Polygon)
                        puntos = self.interaction.sketchCoords_[0];
                    else if (geom instanceof ol.geom.LineString)
                        puntos = self.interaction.sketchCoords_;

                    /*
                    Al menos con linestring, no necesariamente hay que quitar el último
                    Porque OL mete en coordinates del sketchFeature_ tanto el último marcado como el que flota detrás del cursor
                    Para comprobar que realmente es ése, podemos contrastarlo con self.interaction.sketchPoint_.getGeometry().getCoordinates()
                    */
                    var flyingPointContained = false;
                    if (self.interaction.sketchPoint_) {
                        var flyingPoint = self.interaction.sketchPoint_.getGeometry().getCoordinates();
                        for (var i = 0; i < coords.length; i++) {
                            if (coords[i][0] == flyingPoint[0] && coords[i][1] == flyingPoint[1]) {
                                flyingPointContained = true;
                                break;
                            }
                        }
                    }

                    var index;
                    if (flyingPointContained) index = puntos.length - 2;
                    else index = puntos.length - 1;

                    result = puntos[index];
                    puntos.splice(index, 1);

                    if (geom instanceof ol.geom.Polygon) {
                        geom.setCoordinates([puntos]);
                        self.interaction.sketchLine_.getGeometry().setCoordinates(puntos);
                    }
                    else {
                        geom.setCoordinates(puntos);
                    }


                    feature.setGeometry(geom);
                }
            }
        }
        return result;
    };

    TC.wrap.control.Draw.prototype.pushCoordinate = function (coord) {
        var self = this;
        var result = false;
        if (self.interaction) {
            var feature = self.interaction.sketchFeature_;
            if (feature) {
                var coords;
                var geom = feature.getGeometry();

                if (geom instanceof ol.geom.Polygon) {
                    coords = geom.getCoordinates()[0];
                } else if (geom instanceof ol.geom.LineString) {
                    coords = geom.getCoordinates();
                }
                var fullCoords = coords;
                //coords.push(coord);

                var puntos;
                if (geom instanceof ol.geom.Polygon) {
                    puntos = self.interaction.sketchCoords_[0];
                    //self.interaction.sketchCoords_[0].push(coord);
                    //geom.setCoordinates([fullCoords], ol.geom.GeometryLayout.XY);
                } else if (geom instanceof ol.geom.LineString) {

                    puntos = self.interaction.sketchCoords_;
                }

                //Si hay punto volador, hay que meter la coordenada justo antes
                var flyingPointContained = false;
                if (self.interaction.sketchPoint_) {
                    var flyingPoint = self.interaction.sketchPoint_.getGeometry().getCoordinates();
                    for (var i = 0; i < coords.length; i++) {
                        if (coords[i][0] == flyingPoint[0] && coords[i][1] == flyingPoint[1]) {
                            flyingPointContained = true;
                            break;
                        }
                    }
                }


                if (flyingPointContained) index = puntos.length - 1;
                else index = puntos.length;
                puntos.splice(index, 0, coord);

                if (geom instanceof ol.geom.LineString)
                    geom.setCoordinates(puntos, ol.geom.GeometryLayout.XY);
                else {
                    geom.setCoordinates([puntos], ol.geom.GeometryLayout.XY);
                    self.interaction.sketchLine_.getGeometry().setCoordinates(puntos);
                    //feature.setGeometry(geom);
                }


                result = true;
            }
        }
        return result;
    };

    TC.wrap.control.Draw.prototype.undo = function () {
        var self = this;
        var result = false;

        var coord = self.popCoordinate();
        if (coord) {
            self.redoStack.push(coord);
            result = true;
        }

        self.parent.trigger(TC.Consts.event.MEASUREPARTIAL, self.getMeasureData());

        return result;
    };

    TC.wrap.control.Draw.prototype.redo = function () {
        var self = this;
        var result = false;

        if (self.redoStack.length > 0) {
            self.pushCoordinate(self.redoStack.pop());
            result = true;
        }

        self.parent.trigger(TC.Consts.event.MEASUREPARTIAL, self.getMeasureData());

        return result;
    };

    TC.wrap.control.Draw.prototype.end = function () {
        var self = this;
        if (self.interaction && self.interaction.sketchFeature_)
            self.interaction.finishDrawing();
    };

    TC.wrap.control.Draw.prototype.setStyle = function (style) {
        const self = this;
        if (self.interaction) {
            self.interaction.overlay_.setStyle(createNativeStyle({
                styles: style
            }));
        }
    };

    TC.wrap.control.CacheBuilder.prototype.getRequestSchemas = function (options) {
        var self = this;
        var extent = options.extent;
        var layers = options.layers;
        var result = new Array(layers.length);
        for (var i = 0, len = result.length; i < len; i++) {
            var layer = layers[i];
            var schema = {
                layerId: layer.id
            };
            var olSource = layer.wrap.layer.getSource();
            if (olSource.getUrls) {
                schema.url = olSource.getUrls()[0];
            }
            if (olSource.getTileGrid) {
                var tileGrid = olSource.getTileGrid();
                var resolutions = tileGrid.getResolutions();
                var matrixIds = tileGrid.getMatrixIds();
                var node = layer.getLayerNodeByName(layer.layerNames);
                var tmsLimits = null;
                for (var j = 0, llen = node.TileMatrixSetLink.length; j < llen; j++) {
                    var tmsl = node.TileMatrixSetLink[j];
                    if (tmsl.TileMatrixSet === layer.matrixSet) {
                        tmsLimits = tmsl.TileMatrixSetLimits;
                        break;
                    }
                }
                schema.tileMatrixLimits = [];
                for (var j = 0, rlen = resolutions.length; j < rlen; j++) {
                    var origin = tileGrid.getOrigin(j);
                    var tileSize = tileGrid.getTileSize(j);
                    var resolution = resolutions[j];
                    var unitsPerTile = tileSize * resolution;
                    var tml = {
                        mId: matrixIds[j],
                        res: resolution,
                        origin: origin,
                        tSize: tileSize,
                        cl: Math.floor((extent[0] - origin[0]) / unitsPerTile),
                        cr: Math.floor((extent[2] - origin[0]) / unitsPerTile),
                        rt: Math.floor((origin[1] - extent[3]) / unitsPerTile),
                        rb: Math.floor((origin[1] - extent[1]) / unitsPerTile)
                    }
                    if (tmsLimits) {
                        var tmsLimit = tmsLimits[j];
                        if (tmsLimit) {
                            tml.cl = Math.max(tml.cl, tmsLimit.MinTileCol);
                            tml.cr = Math.min(tml.cr, tmsLimit.MaxTileCol);
                            tml.rt = Math.max(tml.rt, tmsLimit.MinTileRow);
                            tml.rb = Math.min(tml.rb, tmsLimit.MaxTileRow);
                        }
                    }
                    if (tml.cl <= tml.cr && tml.rt <= tml.rb) {
                        schema.tileMatrixLimits.push(tml);
                    }
                }
            }
            result[i] = schema;
        }
        return result;
    };

    TC.wrap.control.CacheBuilder.prototype.getGetTilePattern = function (layer) {
        var result = "";
        var olSource = layer.wrap.layer.getSource();
        if (olSource.getUrls) {
            result = olSource.getUrls()[0];
        }
        if (layer.options.encoding !== TC.Consts.WMTSEncoding.RESTFUL) {
            if (result.indexOf('?') < 0) {
                result = result + '?';
            }
            if (result.indexOf('?') === result.length - 1) {
                result = result + 'layer=' + layer.layerNames + '&style=default&tilematrixset=' + encodeURIComponent(layer.matrixSet) +
                    '&Service=WMTS&Request=GetTile&Version=1.0.0&Format=' + encodeURIComponent(layer.format) +
                    '&TileMatrix={TileMatrix}&TileCol={TileCol}&TileRow={TileRow}';
            }
        }
        return result;
    };

    const createHaloStroke1 = function (width) {
        return new ol.style.Stroke({
            color: '#ffffff',
            width: width + 4,
        });
    };

    const createHaloStroke2 = function (width) {
        return new ol.style.Stroke({
            color: '#000000',
            width: width + 6,
        });
    };

    const addHaloToStyle = function (style) {
        if (style === undefined) {
            style = [];
        }
        if (style instanceof ol.style.Style) {
            style = [style];
        }
        style = style.slice();
        const mainStyle = style[0];
        if (mainStyle) {
            const image = mainStyle.getImage();
            var strokeWidth;
            if (image instanceof ol.style.RegularShape) {
                strokeWidth = image.getStroke().getWidth();
                const radius = image.getRadius();
                const haloPart1 = mainStyle.clone();
                haloPart1.setImage(new ol.style.Circle({
                    radius: radius,
                    stroke: createHaloStroke1(strokeWidth)
                }));
                style.unshift(haloPart1);
                const haloPart2 = mainStyle.clone();
                haloPart2.setImage(new ol.style.Circle({
                    radius: radius,
                    stroke: createHaloStroke2(strokeWidth)
                }));
                style.unshift(haloPart2);
            }
            else {
                strokeWidth = mainStyle.getStroke().getWidth();
                style.unshift(new ol.style.Style({
                    stroke: createHaloStroke1(strokeWidth)
                }));
                style.unshift(new ol.style.Style({
                    stroke: createHaloStroke2(strokeWidth)
                }));
            }
            return style;
        }
        return null;
    };

    const createSelectedStyle = function (feat) {
        feat._originalStyle = feat._originalStyle || feat.getStyle();
        if ($.isFunction(feat._originalStyle)) {
            return function (f, r) {
                return addHaloToStyle(feat._originalStyle(f, r));
            };
        }
        return addHaloToStyle(feat._originalStyle);
    };

    const setSelectedStyle = function (feat) {
        updateSelectedStyle.call(feat);
        feat.changed();
        ol.events.listen(feat, ol.events.EventType.CHANGE, updateSelectedStyle, feat);
    };

    const removeSelectedStyle = function (feat) {
        ol.events.unlisten(feat, ol.events.EventType.CHANGE, updateSelectedStyle, feat);
        if (feat._originalStyle) {
            feat.setStyle(null);
            feat.setStyle(feat._originalStyle);
        }
        feat._originalStyle = null;
    };

    const updateSelectedStyle = function () {
        this.style_ = createSelectedStyle(this);
        this.styleFunction_ = !this.style_ ? undefined : ol.Feature.createStyleFunction(this.style_);
    };

    TC.wrap.control.Modify.prototype.activate = function () {
        const self = this;
        if (self.parent.map) {
            Promise.all([self.parent.map.wrap.getMap(), self.parent.layer.wrap.getLayer()]).then(function (olObjects) {
                const olMap = olObjects[0];
                const olLayer = olObjects[1];
                if (self.selectInteraction) {
                    olMap.removeInteraction(self.selectInteraction);
                }
                var select = new ol.interaction.Select({
                    layers: [olLayer],
                    hitTolerance: hitTolerance
                });
                self.selectInteraction = select;
                olMap.addInteraction(select);
                var getWrapperFeature = function (elm) {
                    return elm._wrap.parent;
                };
                select.on('select', function (event) {
                    if (event.selected.length > 0) {
                        self.parent.trigger(TC.Consts.event.FEATURESSELECT, { ctrl: self, features: event.selected.map(getWrapperFeature) });
                    }
                    if (event.deselected.length > 0) {
                        if (event.selected.length == 0) {
                            self.parent.trigger(TC.Consts.event.FEATURESUNSELECT, { ctrl: self.parent, features: event.deselected.map(getWrapperFeature) });
                        }
                    }
                });
                if (self.modifyInteraction) {
                    olMap.removeInteraction(self.modifyInteraction);
                }
                var modify = new ol.interaction.Modify({
                    features: select.getFeatures()
                });
                modify.on(ol.interaction.ModifyEventType.MODIFYEND, function (e) {
                    e.features.forEach(function (feature) {
                        feature._wrap.parent.geometry = feature._wrap.getGeometry();
                        self.parent.trigger(TC.Consts.event.FEATUREMODIFY, { feature: feature._wrap.parent, layer: self.parent.layer });
                    });
                });
                self.modifyInteraction = modify;
                olMap.addInteraction(modify);

                if (self.snapInteraction) {
                    olMap.removeInteraction(self.snapInteraction);
                }
                if (self.parent.snapping) {
                    self.snapInteraction = new ol.interaction.Snap({
                        source: olLayer.getSource()
                    });
                    olMap.addInteraction(self.snapInteraction);
                }

                if (!self._onMouseMove) {
                    self._onMouseMove = function (e) {
                        const mapTarget = olMap.getTarget();
                        var hit = false;
                        var feature;

                        var pixel = olMap.getEventPixel(e);
                        hit = olMap.forEachFeatureAtPixel(pixel, function (feature, layer) {
                            if (layer === self.parent.layer.wrap.layer) {
                                return true;
                            }
                            return false;
                        },
                            {
                                hitTolerance: hitTolerance
                            });

                        if (hit) {
                            mapTarget.style.cursor = 'pointer';
                        } else {
                            mapTarget.style.cursor = '';
                            //self.parent.trigger(TC.Consts.event.FEATUREOUT);
                        }
                    };
                }

                olMap.getViewport().addEventListener(MOUSEMOVE, self._onMouseMove);
            });
        }
    };

    TC.wrap.control.Modify.prototype.deactivate = function () {
        const self = this;
        if (self.modifyInteraction) {
            self.modifyInteraction.setActive(false);
            self.selectInteraction.setActive(false);
            self.parent.map.wrap.getMap().then(function (olMap) {
                olMap.getViewport().removeEventListener(MOUSEMOVE, self._onMouseMove);
                olMap.removeInteraction(self.modifyInteraction);
                olMap.removeInteraction(self.selectInteraction);
                self.modifyInteraction = null;
                self.selectInteraction = null;
            });
        }
    };

    TC.wrap.control.Modify.prototype.getSelectedFeatures = function () {
        var self = this;
        var result = [];
        if (self.selectInteraction) {
            self.selectInteraction.getFeatures().forEach(function (elm) {
                result[result.length] = elm._wrap.parent;
            });
        }
        return result;
    };

    TC.wrap.control.Modify.prototype.setSelectedFeatures = function (features) {
        var self = this;
        if (self.selectInteraction) {
            var source = self.selectInteraction.featureOverlay_.getSource();
            source.clear();
            source.addFeatures(features.map(function (elm) {
                return elm.wrap.feature;
            }));
        }
    };

    TC.wrap.control.Modify.prototype.unselectFeatures = function (features) {
        features = features || [];
        const self = this;
        const selectedFeatures = self.selectInteraction ? self.selectInteraction.getFeatures() : null;
        if (selectedFeatures) {
            const unselectedFeatures = [];
            selectedFeatures.getArray().slice().forEach(function (olFeature) {
                if (!features.length || features.indexOf(olFeature) >= 0) {
                    selectedFeatures.remove(olFeature);
                    unselectedFeatures[unselectedFeatures.length] = olFeature._wrap.parent;
                }
            });
            if (unselectedFeatures.length) {
                self.parent.trigger(TC.Consts.event.FEATURESUNSELECT, { features: unselectedFeatures });
            }
        }
    };

    TC.wrap.control.Edit.prototype.activate = function (mode) {
        var self = this;
        self.cancel(true);
        //if (!self.session) {
        //    self.session = {
        //        features: []
        //        , featuresAdded: []
        //        , featuresRemoved: []
        //        , featuresModified: []
        //    };
        //}
        if (mode === TC.Consts.editMode.SELECT) {
            TC.wrap.control.Modify.prototype.activate.call(self);
        }
    };

    TC.wrap.control.Edit.prototype.deactivate = function () {
        var self = this;
        TC.wrap.control.Modify.prototype.deactivate.call(self);

        if (self.drawInteraction) {
            self.drawInteraction.abortDrawing_();
            self.drawInteraction.setActive(false);
            //self.drawInteraction.destroy();
            self.parent.map.wrap.getMap().then(function (olMap) {
                olMap.removeInteraction(self.drawInteraction);
                self.drawInteraction = null;
            });
            //    self.control.layer.events.un("sketchcomplete");
            //    self.control.deactivate();
            //    self.control.destroy();
            //    self.control = null;
        }
        self.parent.trigger(TC.Consts.event.CONTROLDEACTIVATE, { ctrl: self });
        //self.session = null;        
    };

    TC.wrap.control.Edit.prototype.cancel = function (deactivate, cancelTxt) {
        var self = this;
        self.points = [];
        self.histPoints = [];
        var layer = (self.control && self.control.layer) || (self.modifyInteraction && self.modifyInteraction.layer);
        //if (!self.session || ((self.modifyInteraction && self.modifyInteraction.modified) || (self.session.featuresAdded && self.session.featuresAdded.length)) && cancelTxt && !confirm(cancelTxt))
        //    return;
        if (self.selectInteraction) {
            var features = self.selectInteraction.getFeatures();
            self.parent.trigger(TC.Consts.event.FEATURESUNSELECT, { ctrl: self.parent, feature: features.get(0) });
            features.clear();
            self.selectInteraction.setActive(false);
        }
        //if (self.drawInteraction) {
        //    self.drawInteraction.abortDrawing_();
        //    if (deactivate) {
        //        self.drawInteraction.setActive(false);
        //    }
        //}
        //if(self.modifyInteraction)
        //{
        //    if (self.modifyInteraction.feature)
        //        self.modifyInteraction.unselectFeature(self.modifyInteraction.feature);
        //    if (deactivate)
        //    {
        //        self.modifyInteraction.deactivate();
        //    }   
        //}
        ////if (self.session.featuresAdded && self.session.featuresAdded.length > 0) {
        ////    layer.removeFeatures(self.session.featuresAdded);
        ////    self.session.featuresAdded = [];
        ////}
        //self.parent.trigger(TC.Consts.event.EDITIONCANCEL, { ctrl: self });
        ////no se por que hostias se cambia el renderIntent a las features
        //$.each(layer.features, function (i, feat) {
        //    feat.renderIntent = "";
        //});    
        //layer.removeAllFeatures();
        //layer.addFeatures(self.session.features);        
        //self.clearSession();
    };

    TC.wrap.control.Edit.prototype.getSelectedFeatures = function () {
        return TC.wrap.control.Modify.prototype.getSelectedFeatures.call(this);
    };

    TC.wrap.control.Edit.prototype.setSelectedFeatures = function (features) {
        TC.wrap.control.Modify.prototype.setSelectedFeatures.call(this, features);
    };

    TC.wrap.control.Edit.prototype.deleteFeatures = function (features) {
        var self = this;
        if ($.isArray(features)) {
            var olFeatures = features.map(function (elm) {
                return elm.wrap.feature;
            });
            self.parent.layer.wrap.getLayer().then(function (olLayer) {
                var selectedFeatures = self.selectInteraction ? self.selectInteraction.getFeatures() : null;
                for (var i = 0, len = olFeatures.length; i < len; i++) {
                    var olFeature = olFeatures[i];
                    if (selectedFeatures) {
                        selectedFeatures.remove(olFeature);
                        self.parent.trigger(TC.Consts.event.FEATURESUNSELECT, { feature: olFeature._wrap.parent });
                    }
                    olLayer.getSource().removeFeature(olFeature);
                    self.parent.trigger(TC.Consts.event.FEATUREREMOVE, { feature: olFeature._wrap.parent });
                }
            });
        }
    };

    //TC.wrap.control.Edit.prototype.clearSession = function () {
    //    var self = this;
    //    delete self.session;
    //};

    TC.wrap.Feature.prototype.toGML = function (version, srsName) {
        var parser = new ol.format.GML();
        var xml = parser.writeGeometryNode(this.feature.getGeometry(), {
            dataProjection: srsName
        });
        //reemplazo todos los <loquesea por <gml:loquesea y </loquesea por </gml:loquesea
        return new XMLSerializer().serializeToString(xml.firstChild).replace(/\<\/?\w/gm, function (str) { var pos = str.indexOf("/") > 0 ? str.indexOf("/") + 1 : 1; return str.substring(0, pos) + "gml:" + str.substring(pos) })
        //return new XMLSerializer().serializeToString(xml.firstChild).replace(/\</gm, "<gml:");
    };


    TC.wrap.Feature.prototype.toGeoJSON = function () {
        var parser = new ol.format.GeoJSON();
        return parser.writeGeometry(this.feature.getGeometry());
    };

    TC.wrap.Geometry.write = function (options) {
        options = options || {};
        var geometry;
        switch (options.format) {
            default:
                options.parser = new ol.format.GeoJSON();
        };
        switch (options.type) {
            case TC.Consts.geom.POLYLINE:
                geometry = new ol.geom.LineString(options.coordinates);
                break;
            case TC.Consts.geom.POLYGON:
                geometry = new ol.geom.Polygon(options.coordinates);
                break;
            case TC.Consts.geom.MULTIPOINT:
                geometry = new ol.geom.MultiPoint(options.coordinates);
                break;
            case TC.Consts.geom.MULTIPOLYLINE:
                geometry = new ol.geom.MultiLineString(options.coordinates);
                break;
            case TC.Consts.geom.MULTIPOLYGON:
                geometry = new ol.geom.MultiPolygon(options.coordinates);
                break;
            case TC.Consts.geom.POINT:
            default:
                geometry = new ol.geom.Point(options.coordinates);
                break;
        };
        return options.parser.writeGeometry(geometry);
    };

    TC.wrap.Geometry.toGeoJSON = function (options) {
        return TC.wrap.Geometry.write(options);
    };

    return ol;
});

/*	This work is licensed under Creative Commons GNU LGPL License.

	License: http://creativecommons.org/licenses/LGPL/2.1/
   Version: 0.9
	Author:  Stefan Goessner/2006
	Web:     http://goessner.net/ 
*/
function xml2json(e) { var n = { toObj: function (e) { var t = {}; if (1 == e.nodeType) { if (e.attributes.length) for (var i = 0; i < e.attributes.length; i++) "name" !== e.attributes[i].nodeName && (t[e.attributes[i].nodeName] = (e.attributes[i].nodeValue || "").toString()); if (e.firstChild) { for (var r = 0, o = 0, l = !1, a = e.firstChild; a; a = a.nextSibling) 1 == a.nodeType ? l = !0 : 3 == a.nodeType && a.nodeValue.match(/[^ \f\n\r\t\v]/) ? r++ : 4 == a.nodeType && o++; if (l) if (2 > r && 2 > o) { n.removeWhite(e); for (var a = e.firstChild; a; a = a.nextSibling) { var s = n.removePrefix(a.nodeName); if (3 == a.nodeType) t["#text"] = n.escape(a.nodeValue); else if (4 == a.nodeType) t["#cdata"] = n.escape(a.nodeValue); else if (t[s]) t[s] instanceof Array ? t[s][t[s].length] = n.toObj(a) : t[s] = [t[s], n.toObj(a)]; else { var f = null; a.attributes.getNamedItem("name") && (f = a.attributes.getNamedItem("name").nodeValue), t[f ? f : s] = n.toObj(a) } } } else e.attributes.length ? t["#text"] = n.escape(n.innerXml(e)) : t = n.escape(n.innerXml(e)); else if (r) e.attributes.length ? t["#text"] = n.escape(n.innerXml(e)) : t = n.escape(n.innerXml(e)); else if (o) if (o > 1) t = n.escape(n.innerXml(e)); else for (var a = e.firstChild; a; a = a.nextSibling) t["#cdata"] = n.escape(a.nodeValue) } e.attributes.length || e.firstChild || (t = null) } else 9 == e.nodeType ? t = n.toObj(e.documentElement) : 8 == e.nodeType ? console.log(e.textContent) : alert("unhandled node type: " + e.nodeType); return t }, toJson: function (e, t, i) { var r = t ? '"' + t + '"' : ""; if (e instanceof Array) { for (var o = 0, l = e.length; l > o; o++) e[o] = n.toJson(e[o], "", i + "	"); r += (t ? ":[" : "[") + (e.length > 1 ? "\n" + i + "	" + e.join(",\n" + i + "	") + "\n" + i : e.join("")) + "]" } else if (null == e) r += (t && ":") + "null"; else if ("object" == typeof e) { var a = []; for (var s in e) a[a.length] = n.toJson(e[s], s, i + "	"); r += (t ? ":{" : "{") + (a.length > 1 ? "\n" + i + "	" + a.join(",\n" + i + "	") + "\n" + i : a.join("")) + "}" } else r += "string" == typeof e ? (t && ":") + '"' + e.toString() + '"' : (t && ":") + e.toString(); return r }, innerXml: function (e) { var n = ""; if ("innerHTML" in e) n = e.innerHTML; else for (var t = function (e) { var n = ""; if (1 == e.nodeType) { n += "<" + e.nodeName; for (var i = 0; i < e.attributes.length; i++) n += " " + e.attributes[i].nodeName + '="' + (e.attributes[i].nodeValue || "").toString() + '"'; if (e.firstChild) { n += ">"; for (var r = e.firstChild; r; r = r.nextSibling) n += t(r); n += "</" + e.nodeName + ">" } else n += "/>" } else 3 == e.nodeType ? n += e.nodeValue : 4 == e.nodeType && (n += "<![CDATA[" + e.nodeValue + "]]>"); return n }, i = e.firstChild; i; i = i.nextSibling) n += t(i); return n }, escape: function (e) { return e.replace(/[\\]/g, "\\\\").replace(/[\"]/g, '\\"').replace(/[\n]/g, "\\n").replace(/[\r]/g, "\\r") }, removeWhite: function (e) { e.normalize(); for (var t = e.firstChild; t;) if (3 == t.nodeType) if (t.nodeValue.match(/[^ \f\n\r\t\v]/)) t = t.nextSibling; else { var i = t.nextSibling; e.removeChild(t), t = i } else 1 == t.nodeType ? (n.removeWhite(t), t = t.nextSibling) : t = t.nextSibling; return e }, removePrefix: function (e) { return e.substring(e.indexOf(":") + 1) } }; return 9 == e.nodeType && (e = e.documentElement), n.toObj(n.removeWhite(e)) }

var WFSCapabilities = function () { var e = { V1_0_0: "1.0.0", V1_1_0: "1.1.0", V2_0_0: "2.0.0" }, r = function () { var r, n = [], u = [], p = [], _ = xml2json(arguments[0]); switch (_.version) { case e.V1_0_0: r = e.V1_0_0; break; case e.V1_1_0: r = e.V1_1_0; break; case e.V2_0_0: r = e.V2_0_0 } n = t(_, r), u = a(_, r), p = i(_, r); var o = s(_, r), l = { Operations: n, FeatureTypes: u, Filters: p }; return TC.Util.extend(l, o), l }, t = function (r, t) { switch (t) { case e.V1_0_0: var a = r.Capability.Request; if (a.GetFeature) { var i = []; for (var s in a.GetFeature.ResultFormat) i.push(s.toLowerCase()); a.GetFeature.outputFormat = i, delete a.GetFeature.ResultFormat, a.GetFeature.Operations = r.FeatureTypeList.Operations } return a; case e.V1_1_0: return {}; case e.V2_0_0: var n = {}; for (var s in r.OperationsMetadata) { var u = {}; u[s] = r.OperationsMetadata[s]; for (var p in u[s]) u[s][p] && u[s][p].hasOwnProperty("AllowedValues") && (u[s][p] = u[s][p].AllowedValues.Value); TC.Util.extend(n, u) } return n } return null }, a = function (r, t) { switch (t) { case e.V1_0_0: for (var a = {}, i = 0; i < r.FeatureTypeList.FeatureType.length; i++) { var s = r.FeatureTypeList.FeatureType[i].Name; a[s.substring(s.indexOf(":") + 1)] = r.FeatureTypeList.FeatureType[i] } return a; case e.V1_1_0: return {}; case e.V2_0_0: for (var a = {}, i = 0; i < r.FeatureTypeList.FeatureType.length; i++) { var s = r.FeatureTypeList.FeatureType[i].Name; a[s.substring(s.indexOf(":") + 1)] = r.FeatureTypeList.FeatureType[i] } return a } return null }, i = function (r, t) { switch (t) { case e.V1_0_0: return r.Filter_Capabilities; case e.V1_1_0: return {}; case e.V2_0_0: var a = r.Filter_Capabilities; return a } return null }, s = function (r, t) { switch (t) { case e.V1_0_0: var a = {}; for (var i in r) "string" == typeof r[i] && (a[i] = r[i]); return a; case e.V1_1_0: return {}; case e.V2_0_0: var a = {}; for (var i in r) "string" == typeof r[i] && (a[i] = r[i]); return a } return {} }, n = function (e) { var e = e, t = e.substring(e.indexOf("://") < 0 ? 0 : e.indexOf("://") + 3); if (TC.capabilities[t]) return Promise.resolve(TC.capabilities[t]); var a = {}; return a.SERVICE = "WFS", a.VERSION = "2.0.0", a.REQUEST = "GetCapabilities", new Promise(function (x, y) { TC.ajax({ url: TC.proxify(e) + "?" + TC.Util.getParamString(a), method: "GET" }).then(function (response) { var e = WFSCapabilities.Parse(response.data), a = e.Operations.GetCapabilities.DCP && e.Operations.GetCapabilities.DCP.HTTP.Get["xlink:href"] || e.Operations.GetCapabilities.DCPType[0].HTTP.Get.onlineResource; TC.capabilities[a] = e, TC.capabilities[t] = e, x(WFSCapabilities.Parse(response.data)) }) }) }; return { Promises: n, Parse: r } }();
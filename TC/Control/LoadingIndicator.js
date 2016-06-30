﻿TC.control = TC.control || {};

if (!TC.Control) {
    TC.syncLoadJS(TC.apiLocation + 'TC/Control.js');
}

TC.control.LoadingIndicator = function () {
    var self = this;

    TC.Control.apply(self, arguments);
};

TC.inherit(TC.control.LoadingIndicator, TC.Control);

(function () {
    var ctlProto = TC.control.LoadingIndicator.prototype;

    ctlProto.CLASS = 'tc-ctl-load';

    if (TC.isDebug) {
        ctlProto.template = TC.apiLocation + "TC/templates/LoadingIndicator.html";
    }
    else {
        ctlProto.template = function () { dust.register(ctlProto.CLASS, body_0); function body_0(chk, ctx) { return chk.w("<div class=\"tc-ctl-load-bar\"><div class=\"tc-ctl-load-dots tc-ctl-load-dot1\"> </div><div class=\"tc-ctl-load-dots tc-ctl-load-dot2\"> </div><div class=\"tc-ctl-load-dots tc-ctl-load-dot3\"> </div><div class=\"tc-ctl-load-dots tc-ctl-load-dot4\"> </div><div class=\"tc-ctl-load-dots tc-ctl-load-dot5\"> </div><div class=\"tc-ctl-load-dots tc-ctl-load-dot6\"> </div><div class=\"tc-ctl-load-dots tc-ctl-load-dot7\"> </div><div class=\"tc-ctl-load-dots tc-ctl-load-dot8\"> </div></div>"); } body_0.__dustBody = !0; return body_0 };
    }

    //var ctlProto.waits = {};
    ctlProto.waits = {};

    ctlProto.startWait = function (e) {
        var self = this;
        if (ctlProto.waits[e.layer.id] === undefined) {
            ctlProto.waits[e.layer.id] = 0;
        }
        ctlProto.waits[e.layer.id] = ctlProto.waits[e.layer.id] + 1;
        self.show();
    };

    ctlProto.stopWait = function (e) {
        var self = this;
        var wait = ctlProto.waits[e.layer.id];
        if (wait > 0) {
            wait = ctlProto.waits[e.layer.id] = wait - 1;
        }
        if (!wait) {
            delete ctlProto.waits[e.layer.id];
        }
        var count = 0;
        for (var key in ctlProto.waits) {
            count++;
        }
        if (!count) {
            self.hide();
        }
    };

    ctlProto.reset = function (e) {
        var self = this;
        ctlProto.waits = {};
        self.hide();
    };

    ctlProto.register = function (map) {
        var self = this;
        TC.Control.prototype.register.call(self, map);
        map
            .on(TC.Consts.event.BEFORELAYERADD + ' ' +
                TC.Consts.event.BEFORELAYERUPDATE + ' ' +
                TC.Consts.event.BEFOREFEATURESADD, function (e) { self.startWait(e); })
            .on(TC.Consts.event.LAYERADD + ' ' +
                TC.Consts.event.LAYERERROR + ' ' +
                TC.Consts.event.LAYERUPDATE + ' ' +
                TC.Consts.event.FEATURESADD, function (e) { self.stopWait(e); })
            .on(TC.Consts.event.BEFOREFEATUREINFO, function (e) {
                self.addWait(TC.Consts.event.FEATUREINFO);
            }).on(TC.Consts.event.FEATUREINFO + ' ' +
                TC.Consts.event.NOFEATUREINFO, function (e) {
                    self.removeWait(TC.Consts.event.FEATUREINFO);
                });
        if (!TC.isDebug) {
            // Para evitar que se quede el indicador indefinidamente activo cuando hay un error en la página
            //window.onerror = function () {
            //    self.reset();
            //};
        }
    };

    ctlProto.addWait = function (uid) {
        var result;
        var self = this;
        var result = uid || TC.getUID();
        self.startWait({ layer: { id: result } });
        return result;
    };

    ctlProto.removeWait = function (uid) {
        this.stopWait({ layer: { id: uid } });
    };

})();
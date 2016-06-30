﻿TC.control = TC.control || {};

if (!TC.Control) {
    TC.syncLoadJS(TC.apiLocation + 'TC/Control.js');
}

TC.control.Share = function (options) {
    var self = this;

    TC.Control.apply(self, arguments);
    self.render();
};

TC.inherit(TC.control.Share, TC.Control);

(function () {
    var ctlProto = TC.control.Share.prototype;

    ctlProto.CLASS = 'tc-ctl-share';
    ctlProto.QR_MAX_LENGTH = 150;
    ctlProto.IFRAME_WIDTH = '600px';
    ctlProto.IFRAME_HEIGHT = '450px';

    ctlProto.MOBILEFAV = 'Siga las instrucciones del navegador del dispositivo móvil para añadir como favorito. Se guardará el estado actual del mapa.';
    ctlProto.NAVALERT = ' +D para guardar en marcadores.';


    ctlProto.render = function (callback) {
        var self = this;
        TC.Control.prototype.render.call(self, function () {
            //Si el navegador no soporta copiar al portapapeles, ocultamos el botón de copiar
            if (TC.Util.detectChrome() || TC.Util.detectIE() >= 10 || TC.Util.detectFirefox() >= 41) {
                self._$div.find("button").removeClass("hide");
                var input = self._$div.find("input[type=text]");
                input.removeAttr("data-original-title");
            }

            var $options = self._$div.find('.' + self.CLASS + '-url-box');
            self._$div.find('span').on(TC.Consts.event.CLICK, function (e) {
                var $cb = $(this).closest('label').find('input[type=radio][name=format]');

                var newFormat = $cb.val();
                $options.removeClass(TC.Consts.classes.HIDDEN);
                $options.not('.tc-' + newFormat).addClass(TC.Consts.classes.HIDDEN);
            });

            if ($.isFunction(callback)) {
                callback();
            }
        });
    };

    /**
     * Obtiene una URL "limpia" para compartir el mapa.
     */
    ctlProto.getLocation = function () {
        var result = window.location.href;
        if (window.location.hash) {
            result = result.substr(0, result.indexOf(window.location.hash));
        }
        return result;
    };

    /**
     * Genera el link para compartir el mapa.
     */
    ctlProto.generateLink = function () {
        var self = this;
        var stateControl = self.map.getControlsByClass("TC.control.State")[0];

        if (stateControl) {
            var hashState = stateControl.getMapStateBase64UrlEncoded();

            var currentUrl = window.location.href;
            var hashPosition = currentUrl.indexOf('#');
            if (hashPosition > 0) {
                currentUrl = currentUrl.substring(0, hashPosition);
            }

            var url = currentUrl.concat("#", hashState);

            //Si la URL sobrepasa el tamaño máximo deshabilitamos el control
            if (url.length > TC.Consts.URL_MAX_LENGTH) {
                self.disable();
                return;
            } else {
                self.enable(url);
                return url;
            }

        } else {
            TC.alert(self.getLocaleString('noMapStateControl'));
        }
    };

    ctlProto.generateIframe = function (url) {
        var self = this;
        var urlString = url || this.generateLink();
        if (urlString) {
            return '<iframe style="width:' + self.IFRAME_WIDTH + ';height:' + self.IFRAME_HEIGHT + ';" src="' + urlString + '"></iframe>';
        }
    }

    /**
     * Acorta una URL utilizando el servicio de Bit.ly. No funciona para URLs locales.
     */
    ctlProto.shortenUrl = function (url) {
        var shortUrl;

        $.ajax({
            url: "https://api-ssl.bitly.com/v3/shorten",
            data: { access_token: "6c466047309f44bd8173d83e81491648b243ee3d", longUrl: url },
            async: false
        }).done(function (response) {
            shortUrl = response.data.url;
        });

        return shortUrl;
    };

    ctlProto.register = function (map) {
        var self = this;
        TC.Control.prototype.register.call(self, map);

        self.MOBILEFAV = self.getLocaleString('mobileBookmarks.instructions');
        self.NAVALERT = self.getLocaleString('bookmarks.instructions');

        var selectInputField = function (elm) {
            var input = $(elm).parent().find("input[type=text]");
            input.val(input.hasClass('tc-url') ? self.generateLink() : self.generateIframe());
            input.select();
        };

        var unselectInputField = function () {
            document.getSelection().removeAllRanges();
            document.getSelection().addRange(document.createRange());
        };

        self._$div.on("click", "h2", function (evt) {
            self._$div.find(".tc-url input[type=text]").val(self.generateLink());
            self._$div.find(".tc-iframe input[type=text]").val(self.generateIframe());
        });

        self._$div.on("click", ".tc-ctl-share-url-box button", function (evt) {
            selectInputField(evt.target);
            document.execCommand("copy");

            var copyBtn = $(this);
            copyBtn.text(self.getLocaleString("copied"));
            copyBtn.addClass("btn-default");
            copyBtn.removeClass("btn-red");

            setTimeout(function () {
                copyBtn.text(self.getLocaleString("copy"));
                copyBtn.removeClass("btn-default");
                copyBtn.addClass("btn-red");
                unselectInputField();
            }, 1000);

        });

        self._$div.on("click", "input[type=text]", function (evt) {
            selectInputField(evt.target);
        });

        //Deshabilitar el click de ratón en los enlaces de compartir cuando están deshabilitados
        self._$div.on("click", ".ga-share-icon.disabled", function (evt) {
            evt.stopImmediatePropagation();
            evt.preventDefault()
            return false;
        });

        //Enviar por e-mail
        self._$div.on("click", "a.share-email", function (evt) {
            evt.preventDefault();
            var url = self.generateLink();

            if (url) {
                window.location.href = 'mailto:?body=' + encodeURIComponent(url);
            }
        });

        //Generar código QR
        //Desde localhost no funciona para URLs de más de 300 caracteres, ya que hay que acortarla y bitly no soporta URLs a localhost
        self._$div.on("click", "a.qr-generator", function (evt) {
            evt.preventDefault();
            var url = self.generateLink();

            if (url) {
                var qrContainer = self._$div.find(".qrcode")[0];
                $(qrContainer).empty();
                TC.loadJS(
                    typeof QRCode === 'undefined',
                    [TC.apiLocation + 'qrcode/qrcode.min.js'],
                    function () {

                        if (url.length > self.QR_MAX_LENGTH) {
                            url = self.shortenUrl(url)
                        }
                        new QRCode(qrContainer, url);
                        TC.Util.showModal("#qr-code-dialog", 300, 400);
                    });
            }
        });

        //Compartir en Facebook
        self._$div.on("click", "a.share-fb", function (evt) {
            evt.preventDefault();
            var url = self.generateLink();

            if (url) {
                window.open("https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(url));
                return false;
            }
        });

        //Compartir en Twitter
        self._$div.on("click", "a.share-twitter", function (evt) {
            evt.preventDefault();
            var url = self.generateLink();

            if (url) {
                var shortUrl = self.shortenUrl(url); // desde localhost no funciona la reducción de url

                if (shortUrl !== undefined) {
                    window.open("https://twitter.com/intent/tweet?text=Visor%20IDENA&amp;url=" + encodeURIComponent(shortUrl));
                    return false;
                } else {
                    TC.error("La URL " + url + " no ha podido ser acortada por ser no válida");
                }
            }
        });

        //Guardar en marcadores
        self._$div.on("click", "a.share-star", function (evt) {
            evt.preventDefault();
            
            var bookmarkURL = self.generateLink();
            var bookmarkTitle = document.title;

            if (!TC.Util.detectMouse()) {
                // Mobile browsers
                alert(ctlProto.MOBILEFAV);
            } else if (window.sidebar && window.sidebar.addPanel) {
                // Firefox version < 23
                window.sidebar.addPanel(bookmarkTitle, bookmarkURL, '');
            } else if ((window.sidebar && /Firefox/i.test(navigator.userAgent)) || (window.opera && window.print)) {
                // Firefox version >= 23 and Opera Hotlist                

                window.location.href = bookmarkURL;
                alert((/Mac/i.test(navigator.userAgent) ? 'Cmd' : 'Ctrl') + ctlProto.NAVALERT);

            } else if (window.external && ('AddFavorite' in window.external)) {
                // IE Favorite
                window.external.AddFavorite(bookmarkURL, bookmarkTitle);
            } else {
                // Other browsers (mainly WebKit - Chrome/Safari)                
                window.location.href = bookmarkURL;
                alert((/Mac/i.test(navigator.userAgent) ? 'Cmd' : 'Ctrl') + ctlProto.NAVALERT);
            }

            return false;
        });

        //Cuando se añada o borre una capa, comprobamos de nuevo si la URL cumple los requisitos de longitud para habilitar el control
        //map.on(TC.Consts.event.MAPLOAD, function () {
        //    map.on(TC.Consts.event.LAYERREMOVE + ' ' + TC.Consts.event.LAYERADD, function (e) {
        //        self.generateLink();
        //    });
        //});
    };

    ctlProto.enable = function (url) {
        var self = this;

        var $alert = self._$div.find('.' + self.CLASS + '-alert');
        var $copyBtn = self._$div.find('.tc-button');
        var $shareBtns = self._$div.find('.ga-share-icon');
        var $input = self._$div.find('.tc-textbox');

        $alert.toggleClass(TC.Consts.classes.HIDDEN, true);
        $copyBtn.toggleClass('disabled', false);
        $copyBtn.removeAttr('disabled');
        $.each($shareBtns, function (index, item) {
            $(item).toggleClass('disabled', false);
        });
        $input.filter('.tc-url').val(url);
        $input.filter('.tc-iframe').val(self.generateIframe(url));
    };

    ctlProto.disable = function () {
        var self = this;

        var $alert = self._$div.find('.' + self.CLASS + '-alert');
        var $copyBtn = self._$div.find('.tc-button');
        var $shareBtns = self._$div.find('.ga-share-icon');
        var $input = self._$div.find('.tc-textbox');

        $alert.toggleClass(TC.Consts.classes.HIDDEN, false);
        $copyBtn.toggleClass('disabled', true);
        $copyBtn.attr('disabled', 'disabled');
        $.each($shareBtns, function (index, item) {
            $(item).toggleClass('disabled', true);
        });
        $input.val();
    };

    ctlProto.template = {};

    if (TC.isDebug) {
        ctlProto.template[ctlProto.CLASS] = TC.apiLocation + "TC/templates/Share.html";
    } else {
        ctlProto.template[ctlProto.CLASS] = function () {
            dust.register(ctlProto.CLASS, body_0); function body_0(chk, ctx) { return chk.w("<h2>").h("i18n", ctx, {}, { "$key": "share" }).w("</h2><div><div class=\"ga-share-icons\"><a class=\"ga-share-icon share-email\" target=\"_blank\" data-toggle=\"tooltip\" data-placement=\"top\" title=\"").h("i18n", ctx, {}, { "$key": "sendMapByEmail" }).w("\"href=\"#\"><i class=\"icon-envelope-alt\"></i></a><a class=\"ga-share-icon qr-generator\" target=\"_blank\" data-toggle=\"tooltip\" data-placement=\"top\" title=\"").h("i18n", ctx, {}, { "$key": "createQrCode" }).w("\"href=\"#\"><i class=\"icon-qrcode\"></i></a><a class=\"ga-share-icon share-fb\" target=\"_blank\" data-toggle=\"tooltip\" data-placement=\"top\" title=\"").h("i18n", ctx, {}, { "$key": "shareMapToFacebook" }).w("\"href=\"#\"><i class=\"icon-facebook\"></i></a><a class=\"ga-share-icon share-twitter\" target=\"_blank\" data-toggle=\"tooltip\" data-placement=\"top\" title=\"").h("i18n", ctx, {}, { "$key": "shareMapToTwitter" }).w("\"href=\"#\"><i class=\"icon-twitter\"></i></a><a class=\"ga-share-icon share-star\" target=\"_blank\" data-toggle=\"tooltip\" data-placement=\"top\" title=\"").h("i18n", ctx, {}, { "$key": "addToBookmarks" }).w("\"href=\"#\"><i class=\"icon-star\"></i></a></div><div class=\"tc-ctl-share-select\"><form><label class=\"tc-ctl-share-btn-url\"><input type=\"radio\" checked=\"checked\" name=\"format\" value=\"url\" /><span>").h("i18n", ctx, {}, { "$key": "shareLink" }).w("</span></label><label class=\"tc-ctl-share-btn-iframe\"><input type=\"radio\" name=\"format\" value=\"iframe\" /><span>").h("i18n", ctx, {}, { "$key": "embedMap" }).w("</span></label></form></div><div class=\"tc-ctl-share-url-box tc-group tc-url\"><input type=\"text\" class=\"tc-textbox tc-url\" readonly data-toggle=\"tooltip\" data-placement=\"top\" title=\"").h("i18n", ctx, {}, { "$key": "shareLink.tip.1" }).w("\" /><button class=\"tc-button hide\" title=\"").h("i18n", ctx, {}, { "$key": "shareLink.tip.2" }).w("\">").h("i18n", ctx, {}, { "$key": "copy" }).w("</button></div><div class=\"tc-ctl-share-url-box tc-group tc-iframe tc-hidden\"><input type=\"text\" class=\"tc-textbox tc-iframe\" readonly data-toggle=\"tooltip\" data-placement=\"top\" title=\"").h("i18n", ctx, {}, { "$key": "embedMap.tip.1" }).w("\" /><button class=\"tc-button hide\" title=\"").h("i18n", ctx, {}, { "$key": "embedMap.tip.2" }).w("\">").h("i18n", ctx, {}, { "$key": "copy" }).w("</button></div><div class=\"tc-ctl-share-alert tc-alert alert-warning tc-hidden\"><p>").h("i18n", ctx, {}, { "$key": "tooManyLayersLoaded|s" }).w("</p> </div><div id=\"qr-code-dialog\" class=\"tc-modal\"><div class=\"tc-modal-background tc-modal-close\"></div><div class=\"tc-modal-window\"><div class=\"tc-modal-header\"><h3>").h("i18n", ctx, {}, { "$key": "qrCode" }).w("</h3><div class=\"tc-ctl-popup-close tc-modal-close\"></div></div><div class=\"tc-modal-body\"><div class=\"qrcode\"></div></div><div class=\"tc-modal-footer\"><button type=\"button\" class=\"tc-button tc-modal-close\">").h("i18n", ctx, {}, { "$key": "close" }).w("</button></div></div></div></div>"); } body_0.__dustBody = !0; return body_0
        };
    }

})();
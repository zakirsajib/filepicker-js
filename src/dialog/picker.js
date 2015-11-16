//picker.js
'use strict';

filepicker.extend('picker', function(){
    var fp = this;

    var normalizeOptions = function(options) {
        var normalize = function(singular, plural, def){
            if (options[plural]) {
                if (!fp.util.isArray(options[plural])) {
                    options[plural] = [options[plural]];
                }
            } else if (options[singular]) {
                options[plural] = [options[singular]];
            } else if (def) {
                options[plural] = def;
            }
        };

        normalize('service', 'services');
        normalize('mimetype', 'mimetypes');
        normalize('extension', 'extensions');

        if (options.services) {
            for (var i = 0; i < options.services.length; i++) {
                var service = (''+options.services[i]).replace(' ','');

                if (fp.services[service] !== undefined) {//we use 0, so can't use !
                    service = fp.services[service];
                }

                options.services[i] = service;
            }
        }

        if (options.mimetypes && options.extensions) {
            throw fp.FilepickerException('Error: Cannot pass in both mimetype and extension parameters to the pick function');
        }
        if (!options.mimetypes && !options.extensions){
            options.mimetypes = ['*/*'];
        }

        if (options.openTo) {
            options.openTo = fp.services[options.openTo] || options.openTo;
        }
        fp.util.setDefault(options, 'container', fp.browser.isMobile ? 'window' : 'modal');
    };

    var getPickHandler = function(onSuccess, onError, onProgress, onSelect, target) {
        var handler = function(data) {
            if (filterDataType(data, onProgress, onSelect, target)) {
                return;
            }

            fp.uploading = false;

            if (data.error) {
                fp.util.console.error(data.error);
                onError(fp.errors.FPError(102));
            } else {
                var fpfile = fpfileFromPayload(data.payload);
                //TODO: change payload to not require parsing
                onSuccess(fpfile);
            }

            //Try to close a modal if it exists.
            fp.modal.close();
        };
        return handler;
    };

    var getPickFolderHandler = function(onSuccess, onError, onProgress, onSelect, target) {
        var handler = function(data) {
            if (filterDataType(data, onProgress, onSelect, target)) {
                return;
            }
            fp.uploading = false;

            if (data.error) {
                fp.util.console.error(data.error);
                onError(fp.errors.FPError(102));
            } else {
                data.payload.data.url = data.payload.url;
                onSuccess(data.payload.data);
            }

            //Try to close a modal if it exists.
            fp.modal.close();
        };
        return handler;
    };

    var getUploadingHandler = function(onUploading) {
        onUploading = onUploading || function(){};
        var handler = function(data) {
            if (data.type !== 'uploading') {
                return;
            }
            fp.uploading = !!data.payload;
            onUploading(fp.uploading);
        };
        return handler;
    };

    var addIfExist = function(data, fpfile, key) {
        if (data[key]) {
            fpfile[key] = data[key];
        }
    };

    var fpfileFromPayload = function(payload) {
        var fpfile = {};
        var url = payload.url;
        if (url && url.url) {
            url = url.url;
        }
        fpfile.url = url;
        var data = payload.url.data || payload.data;
        fpfile.filename = data.filename;
        fpfile.mimetype = data.type;
        fpfile.size = data.size;

        addIfExist(data, fpfile, 'id');
        addIfExist(data, fpfile, 'key');
        addIfExist(data, fpfile, 'container');
        addIfExist(data, fpfile, 'path');
        addIfExist(data, fpfile, 'client');

        //TODO: get writeable
        fpfile.isWriteable = true;

        return fpfile;
    };

    var getPickMultipleHandler = function(onSuccess, onError, onProgress, onSelect, target) {
        var handler = function(data) {
            if (filterDataType(data, onProgress, onSelect, target)) {
                return;
            }
            fp.uploading = false;

            if (data.error) {
                fp.util.console.error(data.error);
                onError(fp.errors.FPError(102));
            } else {
                var fpfiles = [];


                //TODO: change payload to not require parsing
                if (!fp.util.isArray(data.payload)) {
                    data.payload = [data.payload];
                }
                for (var i = 0; i < data.payload.length; i++) {
                    var fpfile = fpfileFromPayload(data.payload[i]);
                    fpfiles.push(fpfile);
                }
                onSuccess(fpfiles);
            }

            //Try to close a modal if it exists.
            fp.modal.close();
        };
        return handler;
    };

    var createPicker = function(args) {
        normalizeOptions(args.options);

        if (args.options.debug) {
            return pickerDummyCallback(args);
        }

        if (fp.cookies.THIRD_PARTY_COOKIES === undefined) {
            //if you want a modal, then we need to wait until we know if 3rd party cookies allowed.
            var alreadyHandled = false;
            fp.cookies.checkThirdParty(function(){
                if (!alreadyHandled) {
                    createPicker(args);
                    alreadyHandled = true;
                }
            });
            return;
        }

        var id = fp.util.getId();

        //Wrapper around on success to make sure we don't also fire on close
        var finished = false;
        var onSuccessMark = function(fpfile){
            if (args.options.container === 'window') {
                window.onbeforeunload = null;
            }
            finished = true;
            args.onSuccess(fpfile);
        };
        var onErrorMark = function(fperror){
            finished = true;
            args.onError(fperror);
        };

        var onClose = function(){
            if (!finished) {
                finished = true;
                args.onError(fp.errors.FPError(101));
            }
        };

        var url;

        args.options.onSelectCallback = typeof args.onSelect === 'function';

        if (args.convertFile) {
            url = fp.urls.constructConvertUrl(args.options, id);
        } else if (args.multiple) {
            url = fp.urls.constructPickUrl(args.options, id, true);
        } else if (args.folder) {
            url = fp.urls.constructPickFolderUrl(args.options, id);
        } else {
            url = fp.urls.constructPickUrl(args.options, id, false);
        }

        var target = fp.window.open(args.options.container, url, onClose),
            handler;

        if (args.multiple) {
            handler = getPickMultipleHandler(onSuccessMark, onErrorMark, args.onProgress, args.onSelect, target);
        } else if (args.folder) {
            handler = getPickFolderHandler(onSuccessMark, onErrorMark, args.onProgress, args.onSelect, target);
        } else {
            handler = getPickHandler(onSuccessMark, onErrorMark, args.onProgress, args.onSelect, target);
        }

        
        fp.handlers.attach(id, handler);

        var key = id+'-upload';
        fp.handlers.attach(key, getUploadingHandler(function(){
            fp.handlers.detach(key);
        }));
    };

    function filterDataType(data, onProgress, onSelect, target){ 
        switch(data.type) {
            case 'filepickerProgress':
                fp.uploading = true;
                if (typeof onProgress === 'function') {
                    onProgress(data.payload.data);
                }
                break;
            case 'notUploading':
                fp.uploading = false;
                break;
            case 'closeModal':
                fp.modal.close();
                break;
            case 'hideModal':
                fp.modal.hide();
                break;
            case 'filepickerSelected':
                if (typeof onSelect === 'function') {
                    fp.comm.sendData(target, 'filepickerSelected', {item: onSelect(data.payload.data.item), randomId: data.payload.data.randomId});
                }
                break;
            case 'filepickerUrl':
                return false;
        }
        return true;
    }

    function pickerDummyCallback(args){
            
        var dumy_data = {
            id:1,
            url: 'https://www.filepicker.io/api/file/-nBq2onTSemLBxlcBWn1',
            filename:'test.png',
            mimetype: 'image/png',
            size:58979,
            client:'computer'
        };

        var dumy_callback;

        if (args.multiple || args.options.storeLocation) {
            dumy_callback = [dumy_data, dumy_data, dumy_data];
        } else {
            dumy_callback = dumy_data;
        }

        //return immediately, but still async
        setTimeout(function(){
            args.onSuccess(dumy_callback);
        }, 1);
        return;
    }

    return {
        createPicker: createPicker
    };
});

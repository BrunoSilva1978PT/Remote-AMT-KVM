// ========== DESKTOP ==========

function connectDesktopButton(e) { desktop.disconnectCode = 0; connectDesktop(e); }

var connectDesktopConsent = false;
function connectDesktop(skipConsent) {
    if (!desktop || xxdialogMode) return;
    connectDesktopConsent = false;
    if (desktop.State == 0) {
        desktop.m.useRLE = ((desktopsettings.encflags & 1) != 0);
        desktop.m.bpp = (desktopsettings.encflags & 2) ? 2 : 1;
        if ((amtversion > 15) && amtsysstate && amtsysstate['IPS_KVMRedirectionSettingData'] != null && amtsysstate['IPS_KVMRedirectionSettingData'].response) {
            desktop.m.lowcolor = amtsysstate['IPS_KVMRedirectionSettingData'].response['GrayscalePixelFormatSupported'] && ((desktopsettings.encflags & 16) != 0);
            desktop.m.graymode = amtsysstate['IPS_KVMRedirectionSettingData'].response['GrayscalePixelFormatSupported'] && ((desktopsettings.encflags & 4) != 0);
            desktop.m.useZLib = amtsysstate['IPS_KVMRedirectionSettingData'].response['ZlibControlSupported'] && ((desktopsettings.encflags & 8) != 0);
            desktop.m.decimationMode = ((amtsysstate['IPS_KVMRedirectionSettingData'].response['InitialDecimationModeForLowRes'] > 0) ? desktopsettings.decimationMode : 0);
        } else { desktop.m.lowcolor = false; desktop.m.graymode = false; desktop.m.useZLib = false; desktop.m.decimationMode = 0; }
        desktop.m.showmouse = desktopsettings.showmouse;
        desktop.m.onScreenSizeChange = center;
        desktop.digestRealmMatch = amtstack.wsman.comm.digestRealm;
        if ((amtversion > 15) || urlvars['kvmext']) { desktop.m.kvmExtChanged = updateDesktopState; } else { desktop.m.kvmExtChanged = null; }
        desktop.m.frameRateDelay = ((desktopsettings.limitFrameRate == true)?200:0);
        desktop.m.noMouseRotate = desktopsettings.noMouseRotate;
        desktop.tlsv1only = amtstack.wsman.comm.tlsv1only;
        var ports = portsFromHost(currentcomputer['host'], currentcomputer['tls']);
        if (amtsysstate && amtsysstate['IPS_ScreenConfigurationService'] != null && ((amtsysstate['IPS_ScreenConfigurationService'].response['EnabledState'] & 1) != 0)) {
            amtstack.IPS_ScreenConfigurationService_SetSessionState(Q('id_DeskSB').checked == true ? 1 : 0, 3, function (stack, name, responses, status) {
                if (status != 200) Q('id_DeskSB').checked = false;
                desktop.Start(ports.host, ports.redir, amtstack.wsman.comm.user, amtstack.wsman.comm.pass, currentcomputer['tls']);
            });
        } else {
            desktop.Start(ports.host, ports.redir, amtstack.wsman.comm.user, amtstack.wsman.comm.pass, currentcomputer['tls']);
        }
        PullDesktopDisplayInfo();
        if (!urlvars['norefresh']) { desktopPollTimer = setInterval(PullDesktopDisplayInfo, 5000); }
    } else {
        desktop.Stop();
        clearInterval(desktopPollTimer); desktopPollTimer = null;
        PullDesktopDisplayInfo();
    }
}

function PullDesktopDisplayInfo() {
    if ((amtversion > 7) && (desktop.State > 0)) { amtstack.BatchEnum('', ['*IPS_ScreenSettingData', '*IPS_KVMRedirectionSettingData'], ProcessDesktopDisplayInfo); } else { desktopScreenInfo = null; Q('id_DeskScreenSelector').innerHTML = ''; }
}

function ProcessDesktopDisplayInfo(stack, name, responses, status) {
    if (status != 200) { desktopScreenInfo = null; return; }
    desktopScreenInfo = responses['IPS_ScreenSettingData'].responses.Body;
    desktopScreenInfo.KVMRSD = responses['IPS_KVMRedirectionSettingData'].responses.Body;
    UpdateDesktopDisplayInfo();
}

function UpdateDesktopDisplayInfo() {
    var buttons = '', activeScreens = 0;
    for (var i = 0; i < 3; i++) {
        if (desktopScreenInfo['IsActive'][i] == true) {
            activeScreens++;
            var isActive = (i == desktopScreenInfo.KVMRSD['DefaultScreen']);
            buttons += '<div style="display:inline-block;text-align:center;margin:0 3px;cursor:pointer" onclick="desktopSwitchScreen(' + i + ')" title="Screen ' + (i+1) + '">';
            buttons += '<div style="width:28px;height:20px;border:2px solid ' + (isActive ? 'var(--monitor-active)' : 'var(--text-secondary)') + ';border-radius:3px 3px 0 0;background:' + (isActive ? 'var(--monitor-active)' : 'transparent') + ';color:' + (isActive ? '#fff' : 'var(--text)') + ';font-size:11px;line-height:20px;font-weight:bold">' + (i+1) + '</div>';
            buttons += '<div style="width:12px;height:4px;margin:0 auto;background:' + (isActive ? 'var(--monitor-active)' : 'var(--text-secondary)') + ';border-radius:0 0 2px 2px"></div></div>';
        }
    }
    Q('id_DeskScreenSelector').innerHTML = (activeScreens > 1) ? buttons : '';
}

function desktopSwitchScreen(x) { var k = Clone(desktopScreenInfo.KVMRSD); k['DefaultScreen'] = x; amtstack.Put('IPS_KVMRedirectionSettingData', k, function(stack, name, responses, status) { if (status == 200) { desktopScreenInfo.KVMRSD = responses.Body; UpdateDesktopDisplayInfo(); } }); }

function onDesktopStateChange(desktop, state) {
    idx_connectbutton1.value = (state == 0) ? "Connect" : "Disconnect";
    var input = ((state == 3) && !urlvars['kvmviewonly']);
    QE('id_DeskCAD', input); QE('deskkeys', input); QE('DeskWD', input);
    if (state == 0) {
        if (desktop.m.recordedData != null) { deskRecordSession(); }
        if (desktop.disconnectCode == 2) messagebox("Remote Desktop", "The remote device is busy.");
        else if (desktop.disconnectCode == 3) messagebox("Remote Desktop", "Connection type not supported.");
        else if (desktop.disconnectCode == 50000) messagebox("Remote Desktop", "KVM disconnection - try RLE8 encoding.");
    }
    QV('id_tlsWarning', (state == 3 && desktop.tls == 0));
    center();
    updateDesktopState();
}

function updateDesktopState() {
    var x = '';
    if (desktop.State == 3 && desktop.m && desktop.m.kvmExt) {
        if (desktop.m.kvmExt.decimationState == 1) x += ", Downscaled";
        if (desktop.m.kvmExt.compression == 1) x += ", Compressed";
    }
    Q('id_deskstatus').textContent = StatusStrs[desktop.State] + x;
}

function showDesktopSettings() {
    if (xxdialogMode) return;
    applyDesktopSettings();
    setDialogMode(7, "Remote Desktop Settings", 3, showDesktopSettingsChanged);
}

function showDesktopSettingsChanged() {
    desktopsettings.encflags = parseInt(idx_d7desktopmode.value);
    desktopsettings.showfocus = d7showfocus.checked;
    if ((amtversion > 15) && amtsysstate['IPS_KVMRedirectionSettingData'] && amtsysstate['IPS_KVMRedirectionSettingData'].response && amtsysstate['IPS_KVMRedirectionSettingData'].response['InitialDecimationModeForLowRes'] > 0) desktopsettings.decimationMode = parseInt(d7decimation.value);
    desktopsettings.showmouse = d7showcursor.checked;
    desktopsettings.showcad = d7showcad.checked;
    desktopsettings.limitFrameRate = d7limitFrameRate.checked;
    desktopsettings.noMouseRotate = d7noMouseRotate.checked;
    desktopsettings.quality = d7bitmapquality.value;
    desktopsettings.scaling = d7bitmapscaling.value;
    saveSettings();
    applyDesktopSettings();
    if (desktopsettings.showfocus == false) { desktop.m.focusmode = 0; idx_deskFocusBtn.value = "All Focus"; }
    desktop.m.frameRateDelay = (desktopsettings.limitFrameRate == true)?200:0;
    if (desktop.State != 0) { desktop.disconnectCode = 0; desktop.Stop(); setTimeout(connectDesktop, 800); }
}

function applyDesktopSettings() {
    d7showfocus.checked = desktopsettings.showfocus;
    d7decimation.value = desktopsettings.decimationMode;
    d7showcursor.checked = desktopsettings.showmouse;
    d7showcad.checked = desktopsettings.showcad;
    d7limitFrameRate.checked = desktopsettings.limitFrameRate;
    d7noMouseRotate.checked = desktopsettings.noMouseRotate;
    if (desktopsettings.quality) d7bitmapquality.value = desktopsettings.quality;
    if (desktopsettings.scaling) d7bitmapscaling.value = desktopsettings.scaling;
    QV('d7softkvmsettings', amtversion >= 12);
    var encflags = desktopsettings.encflags, x = '';
    if ((amtversion > 15) && amtsysstate && amtsysstate['IPS_KVMRedirectionSettingData'] != null && amtsysstate['IPS_KVMRedirectionSettingData'].response) {
        if (!amtsysstate['IPS_KVMRedirectionSettingData'].response['GrayscalePixelFormatSupported']) encflags = encflags & 11;
        if (!amtsysstate['IPS_KVMRedirectionSettingData'].response['ZlibControlSupported']) encflags = encflags & 23;
        if (amtsysstate['IPS_KVMRedirectionSettingData'].response['GrayscalePixelFormatSupported']) { x += '<option value=21>RLE4G, 16 Grays</option><option value=5>RLE8G, 256 Grays</option>'; }
        x += '<option value=1>RLE8, 256 Colors</option><option value=3>RLE16, 64k Colors</option>';
        if (amtsysstate['IPS_KVMRedirectionSettingData'].response['ZlibControlSupported']) {
            if (amtsysstate['IPS_KVMRedirectionSettingData'].response['GrayscalePixelFormatSupported']) x += '<option value=29>ZRLE4G</option><option value=13>ZRLE8G</option>';
            x += '<option value=9>ZRLE8</option><option value=11>ZRLE16</option>';
        }
        QV('d7decimationspan', amtsysstate['IPS_KVMRedirectionSettingData'].response['InitialDecimationModeForLowRes'] > 0);
    } else {
        encflags = encflags & 3;
        x += '<option value=1>RLE8, 256 Colors</option><option value=3>RLE16, 64k Colors</option>';
        QV('d7decimationspan', false);
    }
    x += '<option value=0>RAW8, 256 Colors</option><option value=2>RAW16, 16k Colors</option>';
    QH('idx_d7desktopmode', x);
    idx_d7desktopmode.value = encflags;
    QV('idx_deskFocusBtn', desktopsettings.showfocus);
    QV('id_DeskCAD', desktopsettings.showcad);
}

// Desktop keyboard/mouse handlers
function sendCAD() { if (!Q('id_DeskVO').checked) { desktop.m.sendcad(); } }

var deskkeysset = {
    0: [[0xffe7, 1], [0xffe7, 0]], 1: [[0xffe7, 1], [0xff54, 1], [0xff54, 0], [0xffe7, 0]],
    2: [[0xffe7, 1], [0xff52, 1], [0xff52, 0], [0xffe7, 0]], 3: [[0xffe7, 1], [0x6c, 1], [0x6c, 0], [0xffe7, 0]],
    4: [[0xffe7, 1], [0x6d, 1], [0x6d, 0], [0xffe7, 0]], 5: [[0xffe1, 1], [0xffe7, 1], [0x6d, 1], [0x6d, 0], [0xffe7, 0], [0xffe1, 0]],
    6: [[0xffbe, 1], [0xffbe, 0]], 7: [[0xffbf, 1], [0xffbf, 0]], 8: [[0xffc0, 1], [0xffc0, 0]],
    9: [[0xffc1, 1], [0xffc1, 0]], 10: [[0xffc2, 1], [0xffc2, 0]], 11: [[0xffc3, 1], [0xffc3, 0]],
    12: [[0xffc4, 1], [0xffc4, 0]], 13: [[0xffc5, 1], [0xffc5, 0]], 14: [[0xffc6, 1], [0xffc6, 0]],
    15: [[0xffc7, 1], [0xffc7, 0]], 16: [[0xffc8, 1], [0xffc8, 0]], 17: [[0xffc9, 1], [0xffc9, 0]],
    19: [[0xffe9, 1], [0xff09, 1], [0xff09, 0], [0xffe9, 0]], 20: [[0xffe7, 1], [0x72, 1], [0x72, 0], [0xffe7, 0]],
    21: [[0xffe9, 1], [0xffc1, 1], [0xffc1, 0], [0xffe9, 0]], 22: [[0xffe3, 1], [0x77, 1], [0x77, 0], [0xffe3, 0]],
    23: [[0xffe7, 1], [0xff51, 1], [0xff51, 0], [0xffe7, 0]], 24: [[0xffe7, 1], [0xff53, 1], [0xff53, 0], [0xffe7, 0]],
    25: [[0xff1b, 1], [0xff1b, 0]], 26: [[0xffff, 1], [0xffff, 0]],
    27: [[43, 1], [43, 0]], 28: [[45, 1], [45, 0]], 29: [[120, 1], [120, 0]]
};

function deskSendKeys() {
    if (Q('id_DeskVO').checked) return;
    var ks = parseInt(Q('deskkeys').value);
    if (!isNaN(ks) && deskkeysset[ks] && desktop && desktop.State == 3) {
        for (var i = 0; i < deskkeysset[ks].length; i++) desktop.m.sendkey(deskkeysset[ks][i][0], deskkeysset[ks][i][1]);
    }
}

function dmousedown(e) { if (!xxdialogMode && !Q('id_DeskVO').checked) desktop.m.mousedown(e); }
function dmouseup(e) { if (!xxdialogMode && !Q('id_DeskVO').checked) desktop.m.mouseup(e); }
function dmousemove(e) { if (!xxdialogMode && !Q('id_DeskVO').checked) desktop.m.mousemove(e); }
function dmousewheel(e) { if (!xxdialogMode && !Q('id_DeskVO').checked) desktop.m.mousewheel(e); }
function drotate(x) { if (xxdialogMode) return; desktop.m.setRotation(desktop.m.rotation + x); center(); }

function deskToggleFull(kvmonly) {
    if (xxdialogMode) return;
    if (fullscreenonly) { fullscreenonly = false; disconnect(); return; }
    fullscreenonly = kvmonly; fullscreen = !fullscreen;
    QV('id_topheader', !fullscreen); QV('id_leftbar', !fullscreen); QV('id_rdheader', !fullscreen);
    QV('idx_deskFullBtn', !fullscreen); QV('idx_deskFullBtn2', fullscreen);
    if (fullscreen) {
        QS('id_mainarea').top = 0; QS('id_mainarea').left = 0; QS('id_mainarea_pad').padding = 0;
        if (document.documentElement.requestFullscreen) { document.documentElement.requestFullscreen(); }
        else if (document.documentElement.webkitRequestFullscreen) { document.documentElement.webkitRequestFullscreen(); }
    } else {
        QS('id_mainarea').top = '69px'; QS('id_mainarea').left = '156px'; QS('id_mainarea_pad').padding = '8px';
        if (document.fullscreenElement) { document.exitFullscreen(); }
        else if (document.webkitFullscreenElement) { document.webkitExitFullscreen(); }
    }
    center();
}

// Sync fullscreen state when user presses Escape or F11
document.addEventListener('fullscreenchange', function () {
    if (!document.fullscreenElement && fullscreen) { deskToggleFull(); }
});

function deskToggleFocus() { desktop.m.focusmode = (desktop.m.focusmode + 64) % 192; Q('idx_deskFocusBtn').value = ["All Focus", "Small Focus", "Large Focus"][desktop.m.focusmode / 64]; }

function deskRecordSession() {
    if ((desktop == null) || (urlvars && urlvars['norecord'])) return;
    if (desktop.m.recordedData == null) {
        if ((desktop.State === 3) && (desktop.m.StartRecording())) { Q('DeskRecordButton').style.color = '#ff4444'; Q('DeskRecordButton').value = '\u25CF REC'; }
    } else {
        Q('DeskRecordButton').style.color = ''; Q('DeskRecordButton').value = '\u25CF Rec';
        var d = new Date(), n = 'AmtDesktopSession-' + (currentcomputer['name']||'') + '-' + d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
        saveAs(data2blob(desktop.m.StopRecording().join('')), n + '.mcrec');
    }
}

function deskSaveImage() {
    if (xxdialogMode || (desktop.State != 3) || (urlvars && urlvars['norecord'])) return;
    var n = 'Desktop', d = new Date();
    if (amtsysstate) n += '-' + amtsysstate['AMT_GeneralSettings'].response['HostName'];
    n += '-' + d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    Q('Desk')['toBlob'](function (blob) { saveAs(blob, n + '.jpg'); });
}

// ========== PASTE TEXT ==========

function showPasteDialog() {
    if (desktop.State != 3) return;
    var dlg = document.createElement('div');
    dlg.id = 'kvmPasteDialog';
    dlg.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:10000;display:flex;align-items:center;justify-content:center;padding:5vh 5vw';
    dlg.innerHTML = '<div style="background:var(--dialog-bg);border:1px solid var(--border);border-radius:8px;padding:24px;width:100%;max-width:900px;display:flex;flex-direction:column;max-height:80vh;box-shadow:0 4px 20px rgba(0,0,0,0.5)">' +
        '<div style="font-size:16px;font-weight:bold;margin-bottom:12px;color:var(--text)">Paste Text to Remote</div>' +
        '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px">Paste your text here (Ctrl+V), then click Send.</div>' +
        '<textarea id="kvmPasteText" style="width:100%;flex:1;min-height:200px;background:var(--input-bg);color:var(--text);border:1px solid var(--input-border);border-radius:4px;padding:8px;font-family:monospace;font-size:13px;resize:vertical;box-sizing:border-box" placeholder="Paste text here..."></textarea>' +
        '<div style="margin-top:12px;text-align:right;flex-shrink:0"><input type="button" value="Cancel" onclick="closePasteDialog()" style="margin-right:8px"><input type="button" value="Send" onclick="sendPasteText()"></div></div>';
    document.body.appendChild(dlg);
    var ta = document.getElementById('kvmPasteText'); ta.focus();
    if (navigator.clipboard && navigator.clipboard.readText) { navigator.clipboard.readText().then(function(t) { if (t && ta.value === '') ta.value = t; }).catch(function(){}); }
    dlg.addEventListener('keydown', function(e) { if (e.key === 'Escape') { closePasteDialog(); e.preventDefault(); } e.stopPropagation(); });
}
function closePasteDialog() { var dlg = document.getElementById('kvmPasteDialog'); if (dlg) dlg.remove(); }
function sendPasteText() { var ta = document.getElementById('kvmPasteText'); if (ta && ta.value.length > 0) kvmTypeText(ta.value); closePasteDialog(); }

var kvmPasteMap = {};
var kvmCodeToKeysym = {'Quote':39,'Minus':45,'Comma':44,'Period':46,'Slash':47,'Semicolon':59,'Equal':61,'BracketLeft':91,'Backslash':92,'BracketRight':93,'Backquote':96,'IntlBackslash':0x17170056,'Space':32};
var kvmLayoutShift = {
    'pt': {'Digit1':'!','Digit2':'"','Digit3':'#','Digit4':'$','Digit5':'%','Digit6':'&','Digit7':'/','Digit8':'(','Digit9':')','Digit0':'=','Minus':'?','Slash':'_','BracketLeft':'*','Comma':';','Period':':','Backquote':'|','Backslash':'^','Semicolon':'\u00c7','Quote':'\u00aa','Equal':'\u00bb','IntlBackslash':'>'},
    'pt_altgr': {'Digit2':'@','Digit3':'\u00a3','Digit4':'\u00a7','Digit7':'{','Digit8':'[','Digit9':']','Digit0':'}','BracketLeft':'\u0308','BracketRight':'\u0301'},
    'us': {'Digit1':'!','Digit2':'@','Digit3':'#','Digit4':'$','Digit5':'%','Digit6':'^','Digit7':'&','Digit8':'*','Digit9':'(','Digit0':')','Minus':'_','Equal':'+','BracketLeft':'{','BracketRight':'}','Backslash':'|','Semicolon':':','Quote':'"','Backquote':'~','Comma':'<','Period':'>','Slash':'?'}
};

function kvmGetKeysymForCode(code) {
    if (code.startsWith('Key') && code.length == 4) return code.charCodeAt(3) + 32;
    if (code.startsWith('Digit') && code.length == 6) return code.charCodeAt(5);
    return kvmCodeToKeysym[code];
}

// PT keyboard: physical key code → unshifted character
var kvmPtUnshifted = {'Backquote':'\\','Digit1':'1','Digit2':'2','Digit3':'3','Digit4':'4','Digit5':'5','Digit6':'6','Digit7':'7','Digit8':'8','Digit9':'9','Digit0':'0','Minus':"'",'Equal':'\u00ab','KeyQ':'q','KeyW':'w','KeyE':'e','KeyR':'r','KeyT':'t','KeyY':'y','KeyU':'u','KeyI':'i','KeyO':'o','KeyP':'p','BracketLeft':'+','BracketRight':'\u00b4','KeyA':'a','KeyS':'s','KeyD':'d','KeyF':'f','KeyG':'g','KeyH':'h','KeyJ':'j','KeyK':'k','KeyL':'l','Semicolon':'\u00e7','Quote':'\u00ba','Backslash':'~','KeyZ':'z','KeyX':'x','KeyC':'c','KeyV':'v','KeyB':'b','KeyN':'n','KeyM':'m','Comma':',','Period':'.','Slash':'-','Space':' ','IntlBackslash':'<'};

function kvmBuildPasteMap(layout) {
    // Try auto-detection first
    if (!layout && navigator.keyboard && navigator.keyboard.getLayoutMap) {
        navigator.keyboard.getLayoutMap().then(function(lm) {
            var det = 'us';
            if (lm.get('Minus') === "'" && lm.get('Slash') === '-') det = 'pt';
            lm.forEach(function(ch, code) { var ks = kvmGetKeysymForCode(code); if (ks !== undefined) kvmPasteMap[ch] = [ks, false, false]; });
            kvmBuildShiftMaps(det);
        }).catch(function() { kvmBuildPasteMap('pt'); }); // fallback to PT on error
        return;
    }
    // Manual build from hardcoded layout (when getLayoutMap unavailable)
    layout = layout || 'pt';
    var unshifted = (layout === 'pt') ? kvmPtUnshifted : null;
    if (unshifted) {
        for (var code in unshifted) { var ks = kvmGetKeysymForCode(code); if (ks !== undefined) kvmPasteMap[unshifted[code]] = [ks, false, false]; }
    }
    kvmBuildShiftMaps(layout);
}

function kvmBuildShiftMaps(layout) {
    // Uppercase letters
    for (var c = 65; c <= 90; c++) { var lo = String.fromCharCode(c + 32); if (kvmPasteMap[lo]) kvmPasteMap[String.fromCharCode(c)] = [kvmPasteMap[lo][0], true, false]; }
    // Shifted chars
    var sp = kvmLayoutShift[layout] || {};
    for (var code in sp) { var ks = kvmGetKeysymForCode(code); if (ks !== undefined) kvmPasteMap[sp[code]] = [ks, true, false]; }
    // AltGr chars
    var ag = kvmLayoutShift[layout + '_altgr'] || {};
    for (var code in ag) { var ks = kvmGetKeysymForCode(code); if (ks !== undefined) kvmPasteMap[ag[code]] = [ks, false, true]; }
    // PT special: dead key fallbacks
    if (layout === 'pt') {
        if (!kvmPasteMap['\u00e7']) kvmPasteMap['\u00e7'] = [59, false, false];
        if (!kvmPasteMap['\u00c7']) kvmPasteMap['\u00c7'] = [59, true, false];
        if (!kvmPasteMap['\u00ba']) kvmPasteMap['\u00ba'] = [39, false, false];
        if (!kvmPasteMap['\u00aa']) kvmPasteMap['\u00aa'] = [39, true, false];
        if (!kvmPasteMap['\u00ab']) kvmPasteMap['\u00ab'] = [61, false, false];
        if (!kvmPasteMap['\u00bb']) kvmPasteMap['\u00bb'] = [61, true, false];
    }
    console.log('Paste map built: ' + layout + ', ' + Object.keys(kvmPasteMap).length + ' chars');
}
kvmBuildPasteMap();
document.addEventListener('keydown', function(e) {
    if (!e.key || e.key.length != 1 || !e.code || e.metaKey) return;
    var ks = kvmGetKeysymForCode(e.code); if (ks === undefined) return;
    if (e.altKey && e.ctrlKey) kvmPasteMap[e.key] = [ks, false, true];
    else if (e.shiftKey && !e.ctrlKey && !e.altKey) kvmPasteMap[e.key] = [ks, true, false];
    else if (!e.shiftKey && !e.ctrlKey && !e.altKey) kvmPasteMap[e.key] = [ks, false, false];
});

function kvmTypeText(text) {
    if (desktop.State != 3 || !text || text.length == 0) return;
    try { var clipMsg = String.fromCharCode(6, 0, 0, 0) + IntToStr(text.length) + text; desktop.m.send(clipMsg); } catch(e) {}
    var keys = [];
    for (var i = 0; i < text.length; i++) {
        var c = text.charCodeAt(i);
        if (c == 13) continue;
        if (c == 10) { keys.push([0xff0d, 1]); keys.push([0xff0d, 0]); }
        else if (c == 9) { keys.push([0xff09, 1]); keys.push([0xff09, 0]); }
        else if (c == 8) { keys.push([0xff08, 1]); keys.push([0xff08, 0]); }
        else if (c == 27) { keys.push([0xff1b, 1]); keys.push([0xff1b, 0]); }
        else if (c >= 32) {
            var ch = text[i], keysym, needShift = false, needAltGr = false;
            // Dead keys: send dead key keysym + space to commit
            var deadKeyMap = {'~':[92,false], '^':[92,true], '`':[93,true], '\u00b4':[93,false]};
            if (deadKeyMap[ch]) {
                var dk = deadKeyMap[ch];
                if (dk[1]) keys.push([0xffe1, 1]);
                keys.push([dk[0], 1]); keys.push([dk[0], 0]);
                if (dk[1]) keys.push([0xffe1, 0]);
                keys.push([32, 1]); keys.push([32, 0]);
                continue;
            } else if (kvmPasteMap[ch]) { keysym = kvmPasteMap[ch][0]; needShift = kvmPasteMap[ch][1]; needAltGr = kvmPasteMap[ch][2]; }
            else if (c >= 32 && c <= 126) { keysym = c; needShift = (c >= 65 && c <= 90); }
            else continue;
            if (needAltGr) keys.push([0xffea, 1]);
            if (needShift) keys.push([0xffe1, 1]);
            keys.push([keysym, 1]); keys.push([keysym, 0]);
            if (needShift) keys.push([0xffe1, 0]);
            if (needAltGr) keys.push([0xffea, 0]);
        }
    }
    var charGroups = [], group = [];
    for (var k = 0; k < keys.length; k++) {
        group.push(keys[k]);
        if (keys[k][1] === 0 && keys[k][0] < 0xff00) {
            while (k + 1 < keys.length && keys[k + 1][0] >= 0xff00 && keys[k + 1][1] === 0) { k++; group.push(keys[k]); }
            charGroups.push(group); group = [];
        }
    }
    if (group.length > 0) charGroups.push(group);
    var ci = 0;
    function sendNext() {
        if (ci >= charGroups.length || desktop.State != 3) return;
        desktop.m.sendkey(charGroups[ci]); ci++;
        if (ci < charGroups.length) setTimeout(sendNext, 15);
    }
    sendNext();
}

// ========== COPY TEXT (VGA OCR) ==========

var VGA_FONT=[[0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00],[0x00,0x00,0x7E,0x81,0xA5,0x81,0x81,0xBD,0x99,0x81,0x81,0x7E,0x00,0x00,0x00,0x00],[0x00,0x00,0x7E,0xFF,0xDB,0xFF,0xFF,0xC3,0xE7,0xFF,0xFF,0x7E,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x6C,0xFE,0xFE,0xFE,0xFE,0x7C,0x38,0x10,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x10,0x38,0x7C,0xFE,0x7C,0x38,0x10,0x00,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x18,0x3C,0x3C,0xE7,0xE7,0xE7,0x18,0x18,0x3C,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x18,0x3C,0x7E,0xFF,0xFF,0x7E,0x18,0x18,0x3C,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x00,0x00,0x18,0x3C,0x3C,0x18,0x00,0x00,0x00,0x00,0x00,0x00],[0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xE7,0xC3,0xC3,0xE7,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF],[0x00,0x00,0x00,0x00,0x00,0x3C,0x66,0x42,0x42,0x66,0x3C,0x00,0x00,0x00,0x00,0x00],[0xFF,0xFF,0xFF,0xFF,0xFF,0xC3,0x99,0xBD,0xBD,0x99,0xC3,0xFF,0xFF,0xFF,0xFF,0xFF],[0x00,0x00,0x1E,0x0E,0x1A,0x32,0x78,0xCC,0xCC,0xCC,0xCC,0x78,0x00,0x00,0x00,0x00],[0x00,0x00,0x3C,0x66,0x66,0x66,0x66,0x3C,0x18,0x7E,0x18,0x18,0x00,0x00,0x00,0x00],[0x00,0x00,0x3F,0x33,0x3F,0x30,0x30,0x30,0x30,0x70,0xF0,0xE0,0x00,0x00,0x00,0x00],[0x00,0x00,0x7F,0x63,0x7F,0x63,0x63,0x63,0x63,0x67,0xE7,0xE6,0xC0,0x00,0x00,0x00],[0x00,0x00,0x00,0x18,0x18,0xDB,0x3C,0xE7,0x3C,0xDB,0x18,0x18,0x00,0x00,0x00,0x00],[0x00,0x80,0xC0,0xE0,0xF0,0xF8,0xFE,0xF8,0xF0,0xE0,0xC0,0x80,0x00,0x00,0x00,0x00],[0x00,0x02,0x06,0x0E,0x1E,0x3E,0xFE,0x3E,0x1E,0x0E,0x06,0x02,0x00,0x00,0x00,0x00],[0x00,0x00,0x18,0x3C,0x7E,0x18,0x18,0x18,0x7E,0x3C,0x18,0x00,0x00,0x00,0x00,0x00],[0x00,0x00,0x66,0x66,0x66,0x66,0x66,0x66,0x66,0x00,0x66,0x66,0x00,0x00,0x00,0x00],[0x00,0x00,0x7F,0xDB,0xDB,0xDB,0x7B,0x1B,0x1B,0x1B,0x1B,0x1B,0x00,0x00,0x00,0x00],[0x00,0x7C,0xC6,0x60,0x38,0x6C,0xC6,0xC6,0x6C,0x38,0x0C,0xC6,0x7C,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0xFE,0xFE,0xFE,0xFE,0x00,0x00,0x00,0x00],[0x00,0x00,0x18,0x3C,0x7E,0x18,0x18,0x18,0x7E,0x3C,0x18,0x7E,0x00,0x00,0x00,0x00],[0x00,0x00,0x18,0x3C,0x7E,0x18,0x18,0x18,0x18,0x18,0x18,0x18,0x00,0x00,0x00,0x00],[0x00,0x00,0x18,0x18,0x18,0x18,0x18,0x18,0x18,0x7E,0x3C,0x18,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x00,0x18,0x0C,0xFE,0x0C,0x18,0x00,0x00,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x00,0x30,0x60,0xFE,0x60,0x30,0x00,0x00,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x00,0x00,0xC0,0xC0,0xC0,0xFE,0x00,0x00,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x00,0x28,0x6C,0xFE,0x6C,0x28,0x00,0x00,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x10,0x38,0x38,0x7C,0x7C,0xFE,0xFE,0x00,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0xFE,0xFE,0x7C,0x7C,0x38,0x38,0x10,0x00,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00],[0x00,0x00,0x18,0x3C,0x3C,0x3C,0x18,0x18,0x18,0x00,0x18,0x18,0x00,0x00,0x00,0x00],[0x00,0x66,0x66,0x66,0x24,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x6C,0x6C,0xFE,0x6C,0x6C,0x6C,0xFE,0x6C,0x6C,0x00,0x00,0x00,0x00],[0x18,0x18,0x7C,0xC6,0xC2,0xC0,0x7C,0x06,0x06,0x86,0xC6,0x7C,0x18,0x18,0x00,0x00],[0x00,0x00,0x00,0x00,0xC2,0xC6,0x0C,0x18,0x30,0x60,0xC6,0x86,0x00,0x00,0x00,0x00],[0x00,0x00,0x38,0x6C,0x6C,0x38,0x76,0xDC,0xCC,0xCC,0xCC,0x76,0x00,0x00,0x00,0x00],[0x00,0x30,0x30,0x30,0x60,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00],[0x00,0x00,0x0C,0x18,0x30,0x30,0x30,0x30,0x30,0x30,0x18,0x0C,0x00,0x00,0x00,0x00],[0x00,0x00,0x30,0x18,0x0C,0x0C,0x0C,0x0C,0x0C,0x0C,0x18,0x30,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x00,0x66,0x3C,0xFF,0x3C,0x66,0x00,0x00,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x00,0x18,0x18,0x7E,0x18,0x18,0x00,0x00,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x18,0x18,0x18,0x30,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x00,0x00,0x00,0xFE,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x18,0x18,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x02,0x06,0x0C,0x18,0x30,0x60,0xC0,0x80,0x00,0x00,0x00,0x00],[0x00,0x00,0x38,0x6C,0xC6,0xC6,0xD6,0xD6,0xC6,0xC6,0x6C,0x38,0x00,0x00,0x00,0x00],[0x00,0x00,0x18,0x38,0x78,0x18,0x18,0x18,0x18,0x18,0x18,0x7E,0x00,0x00,0x00,0x00],[0x00,0x00,0x7C,0xC6,0x06,0x0C,0x18,0x30,0x60,0xC0,0xC6,0xFE,0x00,0x00,0x00,0x00],[0x00,0x00,0x7C,0xC6,0x06,0x06,0x3C,0x06,0x06,0x06,0xC6,0x7C,0x00,0x00,0x00,0x00],[0x00,0x00,0x0C,0x1C,0x3C,0x6C,0xCC,0xFE,0x0C,0x0C,0x0C,0x1E,0x00,0x00,0x00,0x00],[0x00,0x00,0xFE,0xC0,0xC0,0xC0,0xFC,0x06,0x06,0x06,0xC6,0x7C,0x00,0x00,0x00,0x00],[0x00,0x00,0x38,0x60,0xC0,0xC0,0xFC,0xC6,0xC6,0xC6,0xC6,0x7C,0x00,0x00,0x00,0x00],[0x00,0x00,0xFE,0xC6,0x06,0x06,0x0C,0x18,0x30,0x30,0x30,0x30,0x00,0x00,0x00,0x00],[0x00,0x00,0x7C,0xC6,0xC6,0xC6,0x7C,0xC6,0xC6,0xC6,0xC6,0x7C,0x00,0x00,0x00,0x00],[0x00,0x00,0x7C,0xC6,0xC6,0xC6,0x7E,0x06,0x06,0x06,0x0C,0x78,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x18,0x18,0x00,0x00,0x00,0x18,0x18,0x00,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x18,0x18,0x00,0x00,0x00,0x18,0x18,0x30,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x06,0x0C,0x18,0x30,0x60,0x30,0x18,0x0C,0x06,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x00,0x7E,0x00,0x00,0x7E,0x00,0x00,0x00,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x60,0x30,0x18,0x0C,0x06,0x0C,0x18,0x30,0x60,0x00,0x00,0x00,0x00],[0x00,0x00,0x7C,0xC6,0xC6,0x0C,0x18,0x18,0x18,0x00,0x18,0x18,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x7C,0xC6,0xC6,0xDE,0xDE,0xDE,0xDC,0xC0,0x7C,0x00,0x00,0x00,0x00],[0x00,0x00,0x10,0x38,0x6C,0xC6,0xC6,0xFE,0xC6,0xC6,0xC6,0xC6,0x00,0x00,0x00,0x00],[0x00,0x00,0xFC,0x66,0x66,0x66,0x7C,0x66,0x66,0x66,0x66,0xFC,0x00,0x00,0x00,0x00],[0x00,0x00,0x3C,0x66,0xC2,0xC0,0xC0,0xC0,0xC0,0xC2,0x66,0x3C,0x00,0x00,0x00,0x00],[0x00,0x00,0xF8,0x6C,0x66,0x66,0x66,0x66,0x66,0x66,0x6C,0xF8,0x00,0x00,0x00,0x00],[0x00,0x00,0xFE,0x66,0x62,0x68,0x78,0x68,0x60,0x62,0x66,0xFE,0x00,0x00,0x00,0x00],[0x00,0x00,0xFE,0x66,0x62,0x68,0x78,0x68,0x60,0x60,0x60,0xF0,0x00,0x00,0x00,0x00],[0x00,0x00,0x3C,0x66,0xC2,0xC0,0xC0,0xDE,0xC6,0xC6,0x66,0x3A,0x00,0x00,0x00,0x00],[0x00,0x00,0xC6,0xC6,0xC6,0xC6,0xFE,0xC6,0xC6,0xC6,0xC6,0xC6,0x00,0x00,0x00,0x00],[0x00,0x00,0x3C,0x18,0x18,0x18,0x18,0x18,0x18,0x18,0x18,0x3C,0x00,0x00,0x00,0x00],[0x00,0x00,0x1E,0x0C,0x0C,0x0C,0x0C,0x0C,0xCC,0xCC,0xCC,0x78,0x00,0x00,0x00,0x00],[0x00,0x00,0xE6,0x66,0x66,0x6C,0x78,0x78,0x6C,0x66,0x66,0xE6,0x00,0x00,0x00,0x00],[0x00,0x00,0xF0,0x60,0x60,0x60,0x60,0x60,0x60,0x62,0x66,0xFE,0x00,0x00,0x00,0x00],[0x00,0x00,0xC6,0xEE,0xFE,0xFE,0xD6,0xC6,0xC6,0xC6,0xC6,0xC6,0x00,0x00,0x00,0x00],[0x00,0x00,0xC6,0xE6,0xF6,0xFE,0xDE,0xCE,0xC6,0xC6,0xC6,0xC6,0x00,0x00,0x00,0x00],[0x00,0x00,0x7C,0xC6,0xC6,0xC6,0xC6,0xC6,0xC6,0xC6,0xC6,0x7C,0x00,0x00,0x00,0x00],[0x00,0x00,0xFC,0x66,0x66,0x66,0x7C,0x60,0x60,0x60,0x60,0xF0,0x00,0x00,0x00,0x00],[0x00,0x00,0x7C,0xC6,0xC6,0xC6,0xC6,0xC6,0xC6,0xD6,0xDE,0x7C,0x0C,0x0E,0x00,0x00],[0x00,0x00,0xFC,0x66,0x66,0x66,0x7C,0x6C,0x66,0x66,0x66,0xE6,0x00,0x00,0x00,0x00],[0x00,0x00,0x7C,0xC6,0xC6,0x60,0x38,0x0C,0x06,0xC6,0xC6,0x7C,0x00,0x00,0x00,0x00],[0x00,0x00,0x7E,0x7E,0x5A,0x18,0x18,0x18,0x18,0x18,0x18,0x3C,0x00,0x00,0x00,0x00],[0x00,0x00,0xC6,0xC6,0xC6,0xC6,0xC6,0xC6,0xC6,0xC6,0xC6,0x7C,0x00,0x00,0x00,0x00],[0x00,0x00,0xC6,0xC6,0xC6,0xC6,0xC6,0xC6,0xC6,0x6C,0x38,0x10,0x00,0x00,0x00,0x00],[0x00,0x00,0xC6,0xC6,0xC6,0xC6,0xD6,0xD6,0xD6,0xFE,0xEE,0x6C,0x00,0x00,0x00,0x00],[0x00,0x00,0xC6,0xC6,0x6C,0x7C,0x38,0x38,0x7C,0x6C,0xC6,0xC6,0x00,0x00,0x00,0x00],[0x00,0x00,0x66,0x66,0x66,0x66,0x3C,0x18,0x18,0x18,0x18,0x3C,0x00,0x00,0x00,0x00],[0x00,0x00,0xFE,0xC6,0x86,0x0C,0x18,0x30,0x60,0xC2,0xC6,0xFE,0x00,0x00,0x00,0x00],[0x00,0x00,0x3C,0x30,0x30,0x30,0x30,0x30,0x30,0x30,0x30,0x3C,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x80,0xC0,0xE0,0x70,0x38,0x1C,0x0E,0x06,0x02,0x00,0x00,0x00,0x00],[0x00,0x00,0x3C,0x0C,0x0C,0x0C,0x0C,0x0C,0x0C,0x0C,0x0C,0x3C,0x00,0x00,0x00,0x00],[0x10,0x38,0x6C,0xC6,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0xFF,0x00,0x00],[0x30,0x30,0x18,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x00,0x78,0x0C,0x7C,0xCC,0xCC,0xCC,0x76,0x00,0x00,0x00,0x00],[0x00,0x00,0xE0,0x60,0x60,0x78,0x6C,0x66,0x66,0x66,0x66,0x7C,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x00,0x7C,0xC6,0xC0,0xC0,0xC0,0xC6,0x7C,0x00,0x00,0x00,0x00],[0x00,0x00,0x1C,0x0C,0x0C,0x3C,0x6C,0xCC,0xCC,0xCC,0xCC,0x76,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x00,0x7C,0xC6,0xFE,0xC0,0xC0,0xC6,0x7C,0x00,0x00,0x00,0x00],[0x00,0x00,0x38,0x6C,0x64,0x60,0xF0,0x60,0x60,0x60,0x60,0xF0,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x00,0x76,0xCC,0xCC,0xCC,0xCC,0xCC,0x7C,0x0C,0xCC,0x78,0x00],[0x00,0x00,0xE0,0x60,0x60,0x6C,0x76,0x66,0x66,0x66,0x66,0xE6,0x00,0x00,0x00,0x00],[0x00,0x00,0x18,0x18,0x00,0x38,0x18,0x18,0x18,0x18,0x18,0x3C,0x00,0x00,0x00,0x00],[0x00,0x00,0x06,0x06,0x00,0x0E,0x06,0x06,0x06,0x06,0x06,0x06,0x66,0x66,0x3C,0x00],[0x00,0x00,0xE0,0x60,0x60,0x66,0x6C,0x78,0x78,0x6C,0x66,0xE6,0x00,0x00,0x00,0x00],[0x00,0x00,0x38,0x18,0x18,0x18,0x18,0x18,0x18,0x18,0x18,0x3C,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x00,0xEC,0xFE,0xD6,0xD6,0xD6,0xD6,0xC6,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x00,0xDC,0x66,0x66,0x66,0x66,0x66,0x66,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x00,0x7C,0xC6,0xC6,0xC6,0xC6,0xC6,0x7C,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x00,0xDC,0x66,0x66,0x66,0x66,0x66,0x7C,0x60,0x60,0xF0,0x00],[0x00,0x00,0x00,0x00,0x00,0x76,0xCC,0xCC,0xCC,0xCC,0xCC,0x7C,0x0C,0x0C,0x1E,0x00],[0x00,0x00,0x00,0x00,0x00,0xDC,0x76,0x66,0x60,0x60,0x60,0xF0,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x00,0x7C,0xC6,0x60,0x38,0x0C,0xC6,0x7C,0x00,0x00,0x00,0x00],[0x00,0x00,0x10,0x30,0x30,0xFC,0x30,0x30,0x30,0x30,0x36,0x1C,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x00,0xCC,0xCC,0xCC,0xCC,0xCC,0xCC,0x76,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x00,0x66,0x66,0x66,0x66,0x66,0x3C,0x18,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x00,0xC6,0xC6,0xD6,0xD6,0xD6,0xFE,0x6C,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x00,0xC6,0x6C,0x38,0x38,0x38,0x6C,0xC6,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x00,0xC6,0xC6,0xC6,0xC6,0xC6,0xC6,0x7E,0x06,0x0C,0xF8,0x00],[0x00,0x00,0x00,0x00,0x00,0xFE,0xCC,0x18,0x30,0x60,0xC6,0xFE,0x00,0x00,0x00,0x00],[0x00,0x00,0x0E,0x18,0x18,0x18,0x70,0x18,0x18,0x18,0x18,0x0E,0x00,0x00,0x00,0x00],[0x00,0x00,0x18,0x18,0x18,0x18,0x00,0x18,0x18,0x18,0x18,0x18,0x00,0x00,0x00,0x00],[0x00,0x00,0x70,0x18,0x18,0x18,0x0E,0x18,0x18,0x18,0x18,0x70,0x00,0x00,0x00,0x00],[0x00,0x00,0x76,0xDC,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00]];

var ocrSelecting = false, ocrOverlay = null, ocrStartX = 0, ocrStartY = 0;
function startOcrSelection() {
    if (desktop.State != 3) return;
    var canvas = Q('Desk'); if (!canvas) return;
    ocrSelecting = true;
    var rect = canvas.getBoundingClientRect();
    ocrOverlay = document.createElement('div');
    ocrOverlay.id = 'ocrOverlay';
    ocrOverlay.style.cssText = 'position:fixed;top:' + rect.top + 'px;left:' + rect.left + 'px;width:' + rect.width + 'px;height:' + rect.height + 'px;cursor:crosshair;z-index:9999;user-select:none';
    document.body.appendChild(ocrOverlay);
    var selBox = document.createElement('div'); selBox.id = 'ocrSelBox';
    selBox.style.cssText = 'position:absolute;border:2px dashed #4dd9c0;background:rgba(77,217,192,0.15);display:none;pointer-events:none';
    ocrOverlay.appendChild(selBox);
    var status = document.createElement('div'); status.id = 'ocrStatus';
    status.style.cssText = 'position:absolute;top:8px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.8);color:#4dd9c0;padding:6px 16px;border-radius:4px;font-size:13px;z-index:10000;pointer-events:none';
    status.textContent = 'Draw a rectangle over the text you want to copy';
    ocrOverlay.appendChild(status);
    ocrOverlay.addEventListener('mousedown', ocrMouseDown);
    ocrOverlay.addEventListener('mousemove', ocrMouseMove);
    ocrOverlay.addEventListener('mouseup', ocrMouseUp);
    document.addEventListener('keydown', ocrEscHandler);
}
function ocrEscHandler(e) { if (e.key === 'Escape') cancelOcrSelection(); }
function cancelOcrSelection() { ocrSelecting = false; if (ocrOverlay) { ocrOverlay.remove(); ocrOverlay = null; } document.removeEventListener('keydown', ocrEscHandler); }
function ocrMouseDown(e) { var r = ocrOverlay.getBoundingClientRect(); ocrStartX = e.clientX - r.left; ocrStartY = e.clientY - r.top; var box = Q('ocrSelBox'); box.style.left = ocrStartX + 'px'; box.style.top = ocrStartY + 'px'; box.style.width = '0'; box.style.height = '0'; box.style.display = 'block'; }
function ocrMouseMove(e) { if (!Q('ocrSelBox') || Q('ocrSelBox').style.display === 'none') return; var r = ocrOverlay.getBoundingClientRect(); var cx = e.clientX - r.left, cy = e.clientY - r.top; var box = Q('ocrSelBox'); box.style.left = Math.min(ocrStartX, cx) + 'px'; box.style.top = Math.min(ocrStartY, cy) + 'px'; box.style.width = Math.abs(cx - ocrStartX) + 'px'; box.style.height = Math.abs(cy - ocrStartY) + 'px'; }
function ocrMouseUp(e) {
    var r = ocrOverlay.getBoundingClientRect();
    var endX = e.clientX - r.left, endY = e.clientY - r.top;
    var selW = Math.abs(endX - ocrStartX), selH = Math.abs(endY - ocrStartY);
    if (selW < 10 || selH < 10) { cancelOcrSelection(); return; }
    var canvas = Q('Desk'), canvasRect = canvas.getBoundingClientRect();
    var offX = r.left - canvasRect.left, offY = r.top - canvasRect.top;
    var x1 = Math.min(ocrStartX, endX) + offX, y1 = Math.min(ocrStartY, endY) + offY;
    cancelOcrSelection();
    var dispW = canvas.clientWidth, dispH = canvas.clientHeight, canW = canvas.width, canH = canvas.height;
    var sx = canW / dispW, sy = canH / dispH, cellW = 8, cellH = 16;
    var rawX = x1 * sx, rawY = y1 * sy, rawW = selW * sx, rawH = selH * sy;
    var cx = Math.floor(rawX / cellW) * cellW, cy = Math.floor(rawY / cellH) * cellH;
    var cx2 = Math.ceil((rawX + rawW) / cellW) * cellW, cy2 = Math.ceil((rawY + rawH) / cellH) * cellH;
    if (cx2 > canW) cx2 = Math.floor(canW / cellW) * cellW; if (cy2 > canH) cy2 = Math.floor(canH / cellH) * cellH;
    var cw = cx2 - cx, ch = cy2 - cy;
    if (cw < cellW || ch < cellH) { messagebox('Copy', 'Selection too small'); return; }
    var tmpCanvas = document.createElement('canvas'); tmpCanvas.width = cw; tmpCanvas.height = ch;
    var tmpCtx = tmpCanvas.getContext('2d'); tmpCtx.drawImage(canvas, cx, cy, cw, ch, 0, 0, cw, ch);
    var pixels = tmpCtx.getImageData(0, 0, cw, ch), d = pixels.data;
    var cols = Math.floor(cw / cellW), rows = Math.floor(ch / cellH), lines = [];
    for (var row = 0; row < rows; row++) {
        var line = '';
        for (var col = 0; col < cols; col++) {
            var px = col * cellW, py = row * cellH, lumCounts = {};
            for (var yy = 0; yy < cellH; yy++) { for (var xx = 0; xx < cellW; xx++) { var i = ((py + yy) * cw + (px + xx)) * 4; var lum = Math.round((0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2]) / 8) * 8; lumCounts[lum] = (lumCounts[lum] || 0) + 1; } }
            var sorted = Object.keys(lumCounts).map(Number).sort(function(a,b) { return lumCounts[b] - lumCounts[a]; });
            var bgLum = sorted[0], fgLum = sorted.length > 1 ? sorted[1] : (bgLum > 128 ? 0 : 255);
            var threshold = (bgLum + fgLum) / 2, invert = bgLum > fgLum;
            var cellBits = [];
            for (var yy = 0; yy < cellH; yy++) { var b = 0; for (var xx = 0; xx < cellW; xx++) { var i = ((py + yy) * cw + (px + xx)) * 4; var lum = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2]; if (invert ? (lum < threshold) : (lum > threshold)) b |= (0x80 >> xx); } cellBits.push(b); }
            var bestChar = 32, bestScore = -1;
            for (var ci = 32; ci < 127; ci++) { var score = 0; for (var bi = 0; bi < 16; bi++) { var xor = cellBits[bi] ^ VGA_FONT[ci][bi]; var pc = xor; pc = pc - ((pc >> 1) & 0x55); pc = (pc & 0x33) + ((pc >> 2) & 0x33); pc = (pc + (pc >> 4)) & 0x0F; score += 8 - pc; } if (score > bestScore) { bestScore = score; bestChar = ci; } }
            line += String.fromCharCode(bestChar);
        }
        lines.push(line.replace(/\s+$/, ''));
    }
    while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
    var text = lines.join('\n');
    if (text.length > 0) { navigator.clipboard.writeText(text).then(function() { showOcrResult(text, true); }).catch(function() { showOcrResult(text, false); }); }
    else { messagebox('Copy', 'No text found in selection'); }
}

function showOcrResult(text, copied) {
    cancelOcrSelection();
    var dlg = document.createElement('div'); dlg.id = 'ocrResultDialog';
    dlg.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:10000;display:flex;align-items:center;justify-content:center;padding:5vh 5vw';
    dlg.innerHTML = '<div style="background:var(--dialog-bg);border:1px solid var(--border);border-radius:8px;padding:24px;width:100%;max-width:900px;display:flex;flex-direction:column;max-height:80vh;box-shadow:0 4px 20px rgba(0,0,0,0.5)">' +
        '<div style="font-size:16px;font-weight:bold;margin-bottom:8px;color:var(--text)">Extracted Text' + (copied ? ' (copied)' : '') + '</div>' +
        '<textarea id="ocrResultText" style="width:100%;flex:1;min-height:200px;background:var(--input-bg);color:var(--text);border:1px solid var(--input-border);border-radius:4px;padding:8px;font-family:monospace;font-size:13px;resize:vertical;box-sizing:border-box">' + text.replace(/</g,'&lt;') + '</textarea>' +
        '<div style="margin-top:8px;text-align:right;flex-shrink:0"><input type="button" value="Copy" onclick="var t=Q(\'ocrResultText\');t.select();navigator.clipboard.writeText(t.value)" style="margin-right:8px"><input type="button" value="Close" onclick="Q(\'ocrResultDialog\').remove()"></div></div>';
    document.body.appendChild(dlg);
    dlg.setAttribute('tabindex', '-1'); dlg.focus();
    dlg.addEventListener('keydown', function(e) { if (e.key === 'Escape') dlg.remove(); e.stopPropagation(); });
}

// ========== IDE-R (Virtual Media) ==========

function mountIderImage() {
    Q('iderFileInput').click();
}

function onIderFileSelected(e) {
    var file = e.target.files[0];
    if (!file) return;
    e.target.value = ''; // Reset so same file can be re-selected

    // USB-R (AMT v11+): mount as disk device (0xA0) so it appears as USB drive (sdX)
    // IDE-R (AMT <11): mount as CD-ROM device (0xB0) so it appears as IDE CD (sr0)
    if (currentcomputer && currentcomputer['usbr']) {
        ider.m.floppy = file;
        ider.m.cdrom = null;
    } else {
        ider.m.cdrom = file;
        ider.m.floppy = null;
    }
    ider.m.iderStart = 0; // OnReboot - firmware detects device during boot

    // Connect IDER to the AMT device using same credentials as KVM
    if (ider.State == 0) {
        var ports = portsFromHost(currentcomputer['host'], currentcomputer['tls']);
        ider.Start(ports.host, ports.redir, amtstack.wsman.comm.user, amtstack.wsman.comm.pass, currentcomputer['tls']);
    }
}

function ejectIder() {
    if (ider.State != 0) {
        ider.m.cdrom = null;
        ider.m.floppy = null;
        ider.Stop();
    }
    updateIderUI();
}

function onIderStateChange(obj, state) {
    updateIderUI();
    if (state == 0 && ider.m) {
        ider.m.cdrom = null;
        ider.m.floppy = null;
    }
}

function updateIderUI() {
    var connected = (ider && ider.State == 3);
    var hasMedia = (ider && ider.m && (ider.m.cdrom || ider.m.floppy));
    QV('iderEjectBtn', connected);
    if (connected && hasMedia) {
        var name = ider.m.cdrom ? ider.m.cdrom.name : ider.m.floppy.name;
        var modeLabel = (currentcomputer && currentcomputer['usbr']) ? ' (USB-R)' : ' (IDE-R)';
        Q('iderStatus').textContent = '💿 ' + name + modeLabel;
        Q('iderMountBtn').value = '💿 Change ISO';
    } else if (ider && ider.State > 0) {
        Q('iderStatus').textContent = 'Connecting...';
        Q('iderMountBtn').value = '💿 Mount ISO';
    } else {
        Q('iderStatus').textContent = '';
        Q('iderMountBtn').value = '💿 Mount ISO';
    }
}

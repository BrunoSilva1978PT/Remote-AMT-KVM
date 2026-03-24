// ========== APPLICATION CODE ==========

// FileSaver.js (minimal saveAs implementation)
var saveAs = saveAs || (function(view) {
    var doc = view.document, get_URL = function() { return view.URL || view.webkitURL || view; };
    var save_link = doc.createElementNS("http://www.w3.org/1999/xhtml", "a");
    var can_use_save_link = "download" in save_link;
    var click = function(node) { var event = new MouseEvent("click"); node.dispatchEvent(event); };
    return function(blob, name) {
        var object_url = get_URL().createObjectURL(blob);
        if (can_use_save_link) {
            save_link.href = object_url; save_link.download = name;
            click(save_link);
            setTimeout(function() { get_URL().revokeObjectURL(object_url); }, 1000);
        } else {
            view.open(object_url, "_blank");
        }
    };
}(window));

// ========== GLOBAL VARIABLES ==========

var version = '1.0';
var urlvars = {};
var amtstack;
var wsstack = null;
var desktop;
var ider;
var desktopsettings = { encflags: 1, showfocus: false, showmouse: true, showcad: true, limitFrameRate: false, decimationMode: 2 };
var StatusStrs = ["Disconnected", "Connecting...", "Setup...", "Connected"];
var currentView = 0;
var LoadingHtml = '<div style=text-align:center;padding-top:20px>Loading...<div>';
var amtversion = 0;
var amtversionmin = 0;
var amtFirstPull = 0;
var amtwirelessif = -1;
var amtPowerPollTimer = null;
var disconnecturl = null;
var filterFocus = false;
var t, t2, rsepass = null;
var connectFunc = null;
var connectFuncTag = null;
var computerlist = [];
var currentcomputer = null;
var rmcpStatus = {};
var rmcpPollTimer = null;
var editingComputerH = null;
var computersRunningScripts = 0;
var fullscreen = false;
var fullscreenonly = false;
var desktopScreenInfo = null;
var desktopPollTimer = null;
var webRtcDesktop = null;
var amtdeltatime;
var amtsysstate;
var amtlogicalelements;
var amtfeatures = {};
var xxAccountAdminName, xxAccountRealmInfo = {}, xxAccountEnabledInfo = {}, xxAccountFetch = 999, showHiddenAccounts = false;
var HardwareInventory;
var AmtSystemPowerSchemes = null;
var amtPowerBootCapabilities = null;
var xxdialogMode;
var xxdialogFunc;
var xxdialogButtons;
var xxdialogTag;
var refreshButtonsState = true;
var AmtOcrPba = null, AmtOcrPbaLength = 0;

var httpErrorTable = {
    200: "OK", 401: "Authentication Error", 408: "Timeout", 601: "WSMAN Parsing Error",
    602: "Unable to parse HTTP response header", 603: "Unexpected HTTP enum response",
    604: "Unexpected HTTP pull response", 997: "Invalid Digest Realm"
};

var DMTFPowerStates = ['', '', "Power on", "Light sleep", "Deep sleep", "Power cycle (Soft off)", "Off - Hard", "Hibernate (Off soft)", "Soft off", "Power cycle (Off-hard)", "Main bus reset", "Diagnostic interrupt (NMI)", "Not applicable", "Off - Soft graceful", "Off - Hard graceful", "Master bus reset graceful", "Power cycle (Off - Soft graceful)", "Power cycle (Off - Hard graceful)", "Diagnostic interrupt (INIT)"];

// ========== SETTINGS PERSISTENCE ==========

function loadSettings(callback) {
    var x = new XMLHttpRequest();
    x.onreadystatechange = function() {
        if (x.readyState == 4) {
            if (x.status == 200) { try { var s = JSON.parse(x.responseText); if (s.desktopsettings) { desktopsettings = s.desktopsettings; } } catch (e) {} }
            if (callback) callback();
        }
    };
    x.open('GET', '/settings.ashx', true);
    x.send();
}

function saveSettings() {
    var x = new XMLHttpRequest();
    x.open('POST', '/settings.ashx', true);
    x.setRequestHeader('Content-Type', 'application/json');
    x.send(JSON.stringify({ desktopsettings: desktopsettings }));
}

// ========== STARTUP ==========

function startup() {
    var allelements = document.getElementsByTagName('input');
    for (t = 0; t < allelements.length; t++) { if (allelements[t].id) { window[allelements[t].id] = allelements[t]; } }
    urlvars = getUrlVars();
    document.onclick = function (e) { hideContextMenu(); }

    // Setup the remote desktop
    desktop = CreateAmtRedirect(CreateAmtRemoteDesktop('Desk', Q('id_mainarea')));
    desktop.onStateChanged = onDesktopStateChange;
    QE('idx_connectbutton1', true);

    // Setup IDE-R (virtual media redirection)
    ider = CreateAmtRedirect(CreateAmtRemoteIder());
    ider.onStateChanged = onIderStateChange;
    // Load settings from server (persistent across sessions)
    loadSettings(function() { applyDesktopSettings(); });

    // Main drag & drop
    document.addEventListener('dragover', haltEvent, false);
    document.addEventListener('dragleave', haltEvent, false);
    document.addEventListener('drop', documentFileSelectHandler, false);

    if (!urlvars['host']) { go(101); }
    QH('id_computername', format("Remote-AMT-KVM v{0}", version));

    if (urlvars['host']) {
        var xuser = urlvars['user'] || '*';
        var xpass = urlvars['pass'] || '';
        var xtls = (urlvars['tls'] == 1) ? 1 : 0;
        currentcomputer = { 'host': urlvars['host'], 'user': xuser, 'pass': xpass, 'tls': xtls, 'h': Math.random() };
        disconnecturl = urlvars['disconnecturl'] || 'none';
        if (disconnecturl == 'none') QV('disconnectButton', false);
        if (disconnecturl == 'close') Q('disconnectButton').value = 'Close';
        var ports = portsFromHost(currentcomputer['host'], currentcomputer['tls']);
        if ((currentcomputer['user'] == '*') || (currentcomputer['pass'] != '')) {
            connect(ports.host, ports.http, currentcomputer['user'], currentcomputer['pass'], currentcomputer['tls']);
        } else {
            computerlist = [currentcomputer]; updateComputerList();
            computerConnect(null, currentcomputer.h);
        }
    } else {
        loadComputers();
    }

    document.onkeyup = handleKeyUp;
    document.onkeydown = handleKeyDown;
    document.onkeypress = handleKeyPress;
    window.onresize = center;
    center();
}

function cleanup() { desktop.disconnectCode = 0; desktop.Stop(); }

// ========== KEY HANDLERS ==========

function handleKeyUp(e) {
    if (xxdialogMode) return;
    if (currentView == 101) {
        if (e.keyCode == 45) { addComputer(); }
        if (e.keyCode == 46) { deleteComputers(); }
        if ((e.keyCode == 65) && (e.ctrlKey == true)) { selectAllComputers(); }
        if (e.keyCode == 13) { if (computersRunningScripts == 0) { computerConnect(event, currentcomputer.h); } }
        if ((e.keyCode == 8) && !filterFocus) { var x = Q('computerFilter').value; Q('computerFilter').value = (x.substring(0, x.length - 1)); computerFilterFunc(); }
        if (e.keyCode == 27) { Q('computerFilter').value = ''; computerFilterFunc(); }
    }
    if (currentView == 14 && desktop.State == 3) { if (Q('id_DeskVO').checked) return; return desktop.m.handleKeyUp(e); }
}

function handleKeyDown(e) {
    if (xxdialogMode) return;
    if (currentView == 14 && desktop.State == 3) { if (Q('id_DeskVO').checked) return; return desktop.m.handleKeyDown(e); }
    if (currentView == 101) {
        if (e.keyCode == 38) { var selectprev = null; for (var y in computerlist) { if (currentcomputer.h == computerlist[y].h) { if (selectprev != null) { computerSelect(null, selectprev); } } else { selectprev = computerlist[y].h; } } }
        if (e.keyCode == 40) { var selectnext = 0; for (var y in computerlist) { if (selectnext == 1) { selectnext = 2; computerSelect(null, computerlist[y].h); } else { if (currentcomputer.h == computerlist[y].h) { selectnext = 1; } } } }
    }
}

function handleKeyPress(e) {
    if (xxdialogMode) return;
    if (currentView == 101) { if ((!filterFocus) && (e.keyCode != 0)) { Q('computerFilter').value = ((Q('computerFilter').value + String.fromCharCode(e.keyCode))); computerFilterFunc(); } }
    if (currentView == 14 && desktop.State == 3) { if (Q('id_DeskVO').checked) return; return desktop.m.handleKeys(e); }
}

// ========== CONNECT / DISCONNECT ==========

function connect(host, port, user, pass, tls, func, functag) {
    go(1);
    fullscreenonly = false;
    connectFunc = func;
    connectFuncTag = functag;
    if (urlvars['kvm'] == 1) { go(14); }
    if ((urlvars['kvmfull'] == 1) || (urlvars['kvmonly'] == 1)) { go(14); deskToggleFull(urlvars['kvmonly'] == 1); }

    wsstack = WsmanStackCreateService(host, port, user, pass, tls);
    amtstack = AmtStackCreateService(wsstack);
    amtstack.onProcessChanged = onProcessChanged;
    if (currentcomputer['digestrealm']) { wsstack.comm.digestRealmMatch = currentcomputer['digestrealm']; }

    QV('go14', true);
    amtversion = amtversionmin = amtFirstPull = 0;
    amtsysstate = amtdeltatime = amtlogicalelements = HardwareInventory = undefined;
    amtPowerBootCapabilities = null;
    xxAccountFetch = 999;

    if (!urlvars['norefresh']) { amtPowerPollTimer = setInterval(PullPowerState, 5000); }
    QH('id_TableSysStatus', LoadingHtml);
    amtwirelessif = -1;
    QE('id_DeskCAD', false);
    QE('DeskWD', false);
    QE('deskkeys', false);
    if (urlvars['kvmviewonly']) { QE('id_DeskVO', false); Q('id_DeskVO').checked = true; }
    desktopScreenInfo = null;

    amtstack.BatchEnum('', ['CIM_SoftwareIdentity', '*AMT_SetupAndConfigurationService'], processSystemVersion);
    QV('id_versionWarning', false);
}

function disconnect() {
    if (desktopPollTimer != null) { clearInterval(desktopPollTimer); desktopPollTimer = null; }
    if (fullscreen) deskToggleFull();
    if (amtPowerPollTimer != null) { clearInterval(amtPowerPollTimer); amtPowerPollTimer = null; }
    dialogclose(0);
    QH('id_computername', '');
    if (amtstack) {
        amtstack.onProcessChanged = null;
        amtstack.CancelAllQueries(999);
        amtstack = null;
    }
    cleanup();
    wsstack = null;
    delete amtstack;
    onProcessChanged(0, 1);
    go(101);
    QH('id_computername', format("Remote-AMT-KVM v{0}", version));
}

function onProcessChanged(a, b) {
    if (a == 0) refreshButtons(true);
    if (a != 0 || !amtstack) return;
    if ((amtversion > 0) && ((amtFirstPull & 64) == 0)) {
        amtFirstPull |= 64;
        PullPowerPolicy();
        return;
    }
    if ((amtFirstPull & 1) == 0) { PullHardware(); return; }
}

// ========== COMPUTER LIST ==========

function computerFilterFunc() {
    var filter = computerFilter.value.toLowerCase();
    for (var w in computerlist) { QV('CX-' + computerlist[w].h, filter == '' || computerlist[w].checked == true || computerlist[w]['host'].toLowerCase().indexOf(filter) >= 0 || (computerlist[w]['name'] && computerlist[w]['name'].toLowerCase().indexOf(filter) >= 0)); }
}

function addComputer() {
    if (xxdialogMode) return;
    editingComputerH = null;
    var groups = [], x = '';
    for (var y in computerlist) { var computer = computerlist[y]; if ((computer.tags != null) && (computer.tags != '') && (groups.indexOf(computer.tags) == -1) && (computer.tags.indexOf('"') == -1)) { groups.push(computer.tags); } }
    groups.sort(function (a, b) { return a.toLowerCase().localeCompare(b.toLowerCase()); });
    for (var y in groups) { x += '<option value="' + groups[y] + '">'; }
    QH('d4devGroups', x);
    d4name.value = d4tags.value = d4hostname.value = d4password.value = '';
    d4username.value = "admin";
    QH('d4security', '<option value=0>Digest / None</option><option value=1>Digest / TLS</option>');
    d4security.value = 0;
    setDialogMode(4, "Add Computer", 3, function () { addComputerButton(); });
    updateComputerDialog();
    d4name.focus();
}

function addComputerButton() {
    computerlist.push({ 'h': Math.random(), 'name': encodeURIComponent(d4name.value), 'host': encodeURIComponent(d4hostname.value), 'tags': encodeURIComponent(d4tags.value), 'user': encodeURIComponent(d4username.value), 'pass': encodeURIComponent(d4password.value), 'tls': d4security.value % 2 });
    saveComputers();
    updateComputerList();
}

function scanNetwork() {
    if (xxdialogMode) return;
    setDialogMode(1, 'Scan Network', 0);
    QH('id_dialogMessage', '<div style="text-align:center;padding:20px"><div>Scanning local network for AMT devices...</div><div style="margin-top:10px;font-size:12px;color:var(--text-secondary)">Checking ports 16992/16993</div></div>');
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/amt-scan.ashx', true);
    xhr.onload = function () {
        try {
            var result = JSON.parse(xhr.responseText);
            var devices = result.devices || [];
            if (devices.length === 0) {
                QH('id_dialogMessage', '<div style="text-align:center;padding:20px">No AMT devices found on the local network.</div>');
                setDialogMode(1, 'Scan Network', 1);
                return;
            }
            var html = '<div style="padding:5px"><div style="margin-bottom:8px;font-weight:600">' + devices.length + ' AMT device(s) found:</div>';
            html += '<div style="max-height:300px;overflow-y:auto">';
            for (var i = 0; i < devices.length; i++) {
                var d = devices[i];
                var exists = false;
                for (var j in computerlist) { if (decodeURIComponent(computerlist[j].host || '').split(':')[0] === d.ip) { exists = true; break; } }
                html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:4px 6px;border-bottom:1px solid var(--border)">';
                html += '<span>' + d.ip + ':' + d.port + (d.tls ? ' (TLS)' : '') + '</span>';
                if (exists) {
                    html += '<span style="font-size:11px;color:var(--text-secondary)">Already added</span>';
                } else {
                    html += '<input type="button" value="Add" onclick="scanAddComputer(\'' + d.ip.replace(/'/g, "\\'").replace(/[\\"><]/g, '') + '\',' + parseInt(d.port) + ',' + (d.tls ? 1 : 0) + ');this.disabled=true;this.value=\'Added\'">';
                }
                html += '</div>';
            }
            html += '</div></div>';
            QH('id_dialogMessage', html);
            setDialogMode(1, 'Scan Network', 1);
        } catch (e) {
            QH('id_dialogMessage', '<div style="text-align:center;padding:20px;color:red">Error parsing scan results.</div>');
            setDialogMode(1, 'Scan Network', 1);
        }
    };
    xhr.onerror = function () {
        QH('id_dialogMessage', '<div style="text-align:center;padding:20px;color:red">Network scan failed.</div>');
        setDialogMode(1, 'Scan Network', 1);
    };
    xhr.send();
}

function scanAddComputer(ip, port, tls) {
    var host = (port === 16992 || port === 16993) ? ip : ip + ':' + port;
    computerlist.push({ 'h': Math.random(), 'name': encodeURIComponent(ip), 'host': encodeURIComponent(host), 'tags': encodeURIComponent('Scanned'), 'user': encodeURIComponent('admin'), 'pass': '', 'tls': tls });
    saveComputers();
    updateComputerList();
}

function updateComputerDialog() {
    var k = Q('d4security').value >= 2;
    QV('d4digest', !k); QV('d4kerb', k);
    var hostSplit = d4hostname.value.split(':');
    var hostnameok = (d4hostname.value.length > 0) && (hostSplit.length < 3);
    if (hostnameok && (hostSplit.length == 2)) { var hostport = parseInt(hostSplit[1]); hostnameok = (hostport > 0) && (hostport < 65536) && (hostport == hostSplit[1]); }
    // Check for duplicate name
    var nameVal = d4name.value.trim();
    var nameDup = false;
    if (nameVal.length > 0) {
        for (var i in computerlist) {
            var existingName = decodeURIComponent(computerlist[i].name || '');
            if (existingName.toLowerCase() === nameVal.toLowerCase()) {
                if (editingComputerH != null && computerlist[i].h == editingComputerH) continue;
                nameDup = true; break;
            }
        }
    }
    QS('d4name')['background-color'] = (nameDup ? 'var(--input-warn, LightYellow)' : 'var(--input-bg)');
    QS('d4hostname')['background-color'] = (hostnameok ? 'var(--input-bg)' : 'var(--input-warn, LightYellow)');
    if (k && hostnameok) {
        QE('idx_dlgOkButton', d4hostname.value.length > 0 && !nameDup);
    } else {
        QS('d4username')['background-color'] = (((d4username.value.length > 0) && (d4username.value != '*')) ? 'var(--input-bg)' : 'var(--input-warn, LightYellow)');
        QS('d4password')['background-color'] = (((d4username.value == '$$OsAdmin') || passwordcheck(d4password.value) || d4password.value == '') ? 'var(--input-bg)' : 'var(--input-warn, LightYellow)');
        QE('idx_dlgOkButton', d4hostname.value.length > 0 && d4username.value.length > 0 && d4username.value != '*' && ((d4username.value == '$$OsAdmin') || passwordcheck(d4password.value) || d4password.value == '') && !nameDup);
    }
}

function computerEdit(h) {
    if (xxdialogMode) return;
    editingComputerH = h;
    var c = null;
    for (x = 0; x < computerlist.length; x++) { if (computerlist[x]['h'] == h) { c = computerlist[x]; } }
    var groups = [], x = '';
    for (var y in computerlist) { var computer = computerlist[y]; if ((computer.tags != null) && (computer.tags != '') && (groups.indexOf(computer.tags) == -1)) { groups.push(computer.tags); } }
    groups.sort(function (a, b) { return a.toLowerCase().localeCompare(b.toLowerCase()); });
    for (var y in groups) { x += '<option value="' + groups[y] + '">'; }
    QH('d4devGroups', x);
    QH('d4security', '<option value=0>Digest / None</option><option value=1>Digest / TLS</option>');
    d4name.value = decodeURIComponent(c['name']||'');
    d4tags.value = decodeURIComponent(c['tags']||'');
    d4hostname.value = decodeURIComponent(c['host']);
    d4security.value = c['tls'];
    d4username.value = decodeURIComponent(c['user']||'');
    d4password.value = decodeURIComponent(c['pass']||'');
    setDialogMode(4, "Edit Device", 7, function (r) { computerEditOk(r, h); });
    updateComputerDialog();
    Q('d4name').focus();
}

function computerEditOk(r, h) {
    if (r == 2) { computerRemoveEx(h); return; }
    var c = null;
    for (x = 0; x < computerlist.length; x++) { if (computerlist[x]['h'] == h) { c = computerlist[x]; } }
    c['name'] = decodeURIComponent(d4name.value);
    c['tags'] = decodeURIComponent(d4tags.value);
    c['host'] = decodeURIComponent(d4hostname.value);
    c['user'] = decodeURIComponent(d4username.value);
    c['pass'] = decodeURIComponent(d4password.value);
    c['tls'] = d4security.value % 2;
    saveComputers();
    updateComputerList();
    updateComputerDetails();
}

function computerRemoveEx(h) {
    if (currentcomputer && currentcomputer['h'] == h) currentcomputer = null;
    for (x = 0; x < computerlist.length; x++) { if (computerlist[x]['h'] == h) { computerlist.splice(x, 1); } }
    saveComputers(); updateComputerList(); updateComputerDetails();
}

function deleteComputers() {
    if (xxdialogMode) return;
    var clist = [];
    for (var y in computerlist) { if (computerlist[y].checked == true) { clist.push(computerlist[y]); } }
    if (clist.length == 0) { clist.push(currentcomputer); }
    setDialogMode(11, "Delete Computers", 3, function(button, tag) {
        for (var i in tag) { var h = tag[i]['h']; if (currentcomputer && currentcomputer['h'] == h) currentcomputer = null; for (x = 0; x < computerlist.length; x++) { if (computerlist[x]['h'] == h) { computerlist.splice(x, 1); } } }
        saveComputers(); updateComputerList(); updateComputerDetails();
    }, '<br>' + (clist.length == 1 ? "Delete computer?" : format("Delete {0} computers?", clist.length)), clist);
}

function selectAllComputers() {
    var x = false;
    for (var y in computerlist) { if (computerlist[y].checked == false) { x = true; } }
    for (var y in computerlist) { computerlist[y].checked = x; Q('SJ-' + computerlist[y]['h']).checked = x; }
}

function onFilterFocus(x) { filterFocus = x; }

function updateComputerList() {
    QH('id_computerList', '');
    QV('id_noKnownComputers', computerlist.length == 0);
    QV('computerFilter', computerlist.length != 0);
    QE('saveComputersButton', computerlist.length != 0);
    computersRunningScripts = 0;
    QV('id_computerDetailsParent', computerlist.length != 0);
    QS('id_computerListParent').right = (computerlist.length == 0 ? 0 : '300px');
    computerlist.sort(function (a, b) { var aa = a['name'] ? a['name'].toLowerCase() : a['host'].toLowerCase(); var bb = b['name'] ? b['name'].toLowerCase() : b['host'].toLowerCase(); return aa > bb ? 1 : aa < bb ? -1 : 0; });
    if (currentcomputer == null && computerlist.length > 0) { currentcomputer = computerlist[0]; }

    var groups = [''], groupHtml = {};
    for (var y in computerlist) { var computer = computerlist[y]; if ((computer.tags != null) && (groups.indexOf(computer.tags) == -1)) { groups.push(computer.tags); } }
    groups.sort(function (a, b) { return a.toLowerCase().localeCompare(b.toLowerCase()); });
    for (var y in groups) { groupHtml[groups[y]] = ''; }

    for (var y in computerlist) {
        var computer = computerlist[y], extra = [], group = '';
        if (computer.tags != null) { group = computer.tags; }
        if (computer['user']) { extra.push(EscapeHtml(decodeURIComponent(computer['user']))); }
        extra.push((computer['tls'] == 0) ? "No&nbsp;Security" : "TLS");
        var name = decodeURIComponent(computer['host']);
        if (computer['name'] && computer['name'] != '') name = decodeURIComponent(computer['name']);
        var tlsColor = (computer['tls'] == 0) ? '#ff6b6b' : '#00d4aa';
        var x = '<div id=CX-' + computer['h'] + ' ondblclick=computerEdit(' + computer['h'] + ')>';
        x += '<div><table style="height:32px;width:calc(100% - 8px);margin:2px 4px;cursor:pointer;border:none;border-radius:4px" cellspacing=0 cellpadding=0';
        var cmenus = ["Connect#computerConnect(event," + computer['h'] + ")", "Edit...#computerEdit(" + computer['h'] + ")"];
        x += ' cm=\'' + cmenus.join('|') + '\'';
        x += ' onclick="computerSelect(event, ' + computer['h'] + ')" id=CI-' + computer['h'] + '>';
        x += '<td id=LCX-' + computer['h'] + ' style="width:3px;background:' + tlsColor + ';border-radius:4px 0 0 4px;float:none">&nbsp;</td>';
        x += '<td style=width:10px;padding-left:6px><input id=SJ-' + computer['h'] + ' type=checkbox onclick=onComputerChecked()' + (computer.checked?' checked':'') + ' /></td>';
        var rHost = decodeURIComponent(computer['host']).split(':')[0];
        var rStatus = rmcpStatus[rHost];
        var rmcpColor = '#555', rmcpTitle = 'Checking...';
        if (rStatus) {
            if (rStatus.status === 'online') { rmcpColor = (rStatus.provisioningState === 1) ? '#ffaa00' : '#00d4aa'; rmcpTitle = 'AMT online' + (rStatus.amtVersion ? ' (v' + rStatus.amtVersion + ')' : ''); }
            else { rmcpColor = '#555'; rmcpTitle = 'AMT offline'; }
        }
        x += '<td style="width:12px;padding-left:4px"><div id=RMCP-' + computer['h'] + ' title="' + rmcpTitle + '" style="width:8px;height:8px;border-radius:50%;background:' + rmcpColor + ';display:inline-block;transition:background 0.3s"></div></td>';
        x += '<td align=left style=padding-left:6px><b style=font-size:14px>' + EscapeHtml(name) + '</b></td>';
        x += '<td align=right style="padding-right:8px;font-size:9pt;color:#8892b0">' + extra.join(', ') + '</td><td style=width:1px;padding-right:6px>' + AddButton2("Connect", 'computerConnect(event,' + computer['h'] + ')') + '</td>';
        x += '<td id=RCX-' + computer['h'] + ' style="width:3px;background:' + tlsColor + ';border-radius:0 4px 4px 0;float:none">&nbsp;</td>';
        x += '</table></div></div>';
        groupHtml[group] += x;
    }

    if (computerlist.length > 0) {
        var x = '';
        for (var y in groups) {
            if (groups[y] != '') { x += '<div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#8892b0;border-bottom:1px solid #2a3a5c;margin:4px 8px;padding:8px 0 4px 0"><b>' + EscapeHtml(groups[y]) + '</b></div>'; }
            x += groupHtml[groups[y]];
        }
        QH('id_computerList', '<div style=width:99%>' + x + '</div>');
    }
    updateComputerDetails();
}

function onComputerChecked() { for (var y in computerlist) { computerlist[y].checked = Q('SJ-' + computerlist[y]['h']).checked; } }

function addComputerDetailsEntry(x, y) { return '<div style="border-radius:6px;padding:8px 10px;margin-bottom:6px;background-color:#0d1b30;border:1px solid #2a3a5c"><div style="width:100%;font-size:9px;color:#8892b0;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px">' + x + '</div><div style="width:100%;font-size:13px;color:#e0e0e0">' + y + '</div></div>'; }

function updateComputerDetails() {
    var x = '<div style=position:absolute;top:0;right:0;left:0;bottom:0>';
    if (currentcomputer != null) {
        x += '<div style="position:absolute;top:8px;left:8px;right:8px;text-align:center">';
        var detailName = currentcomputer['name'] ? EscapeHtml(decodeURIComponent(currentcomputer['name'])) : EscapeHtml(decodeURIComponent(currentcomputer['host']));
        x += '<div style="font-size:14px;font-weight:700;color:#00d4aa;margin-bottom:4px">' + detailName + '</div>';
        x += '</div>';
        var bottomButtons = '<div style="position:absolute;bottom:8px;left:8px;right:8px;display:flex;gap:6px">';
        bottomButtons += '<input type=Button value="Edit..." style="flex:1" onclick=computerEdit(' + currentcomputer['h'] + ')>';
        bottomButtons += '<input type=Button value="Connect" style="flex:1;background:#0f3460 !important;border-color:#00d4aa !important;color:#00d4aa !important" onclick=computerConnect(event,' + currentcomputer['h'] + ')>';
        bottomButtons += '</div>';
        x += '<div style="overflow-y:auto;position:absolute;top:38px;left:8px;right:8px;bottom:48px">';
        x += addComputerDetailsEntry("Host Name", decodeURIComponent(currentcomputer['host']));
        x += addComputerDetailsEntry("Authentication", EscapeHtml(decodeURIComponent(currentcomputer['user']||'')));
        x += addComputerDetailsEntry("Security", ((currentcomputer['tls'] == 0) ? "None" : "TLS Security"));
        if (currentcomputer['tags']) { x += addComputerDetailsEntry("Group Name", EscapeHtml(decodeURIComponent(currentcomputer['tags']))); }
        if (currentcomputer['ver']) { x += addComputerDetailsEntry("Intel&reg; AMT", "v" + currentcomputer['ver']); }
        x += '</div>';
        x += bottomButtons;
    }
    QH('id_computerDetails', x + '</div>');
    computerSelect();
}

function saveComputers() {
    if (urlvars['host']) return;
    try { localStorage.setItem('computers', JSON.stringify(computerlist)); } catch (ex) { }
    try { var xhr = new XMLHttpRequest(); xhr.open('POST', '/webrelay.ashx?action=savecomputerlist', true); xhr.setRequestHeader('Content-Type', 'application/json'); xhr.send(JSON.stringify(computerlist)); } catch (ex) { }
}

function loadComputers() {
    if (urlvars['host']) return;
    try {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', '/webrelay.ashx?action=getcomputerlist', true);
        xhr.onreadystatechange = function() {
            if (xhr.readyState === 4) {
                if (xhr.status === 200 && xhr.responseText) { try { computerlist = JSON.parse(xhr.responseText); } catch (e) { computerlist = []; } }
                else { var ctext = null; try { ctext = localStorage.getItem('computers'); } catch (ex) { } if (ctext) { try { computerlist = JSON.parse(ctext); } catch (e) { computerlist = []; } } }
                updateComputerList();
                startRmcpPolling();
            }
        };
        xhr.send();
    } catch (ex) {
        var ctext = null; try { ctext = localStorage.getItem('computers'); } catch (ex2) { }
        if (ctext) { try { computerlist = JSON.parse(ctext); } catch (e) { computerlist = []; } }
        updateComputerList();
        startRmcpPolling();
    }
}

function startRmcpPolling() {
    pollRmcpStatus();
    if (rmcpPollTimer) clearInterval(rmcpPollTimer);
    rmcpPollTimer = setInterval(pollRmcpStatus, 30000);
}

function pollRmcpStatus() {
    if (computerlist.length === 0) return;
    var hosts = [];
    for (var i = 0; i < computerlist.length; i++) {
        var h = decodeURIComponent(computerlist[i]['host']).split(':')[0];
        if (h && hosts.indexOf(h) === -1) hosts.push(h);
    }
    if (hosts.length === 0) return;
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/rmcp-ping.ashx?hosts=' + encodeURIComponent(hosts.join(',')) + '&timeout=2000', true);
    xhr.onreadystatechange = function () {
        if (xhr.readyState === 4 && xhr.status === 200) {
            try {
                var arr = JSON.parse(xhr.responseText);
                for (var i = 0; i < arr.length; i++) { rmcpStatus[arr[i].host] = arr[i]; }
                updateRmcpIndicators();
            } catch (e) { }
        }
    };
    xhr.send();
}

function updateRmcpIndicators() {
    for (var i = 0; i < computerlist.length; i++) {
        var computer = computerlist[i];
        var rHost = decodeURIComponent(computer['host']).split(':')[0];
        var dotEl = document.getElementById('RMCP-' + computer['h']);
        if (!dotEl) continue;
        var rStatus = rmcpStatus[rHost];
        if (rStatus && rStatus.status === 'online') {
            dotEl.style.background = (rStatus.provisioningState === 1) ? '#ffaa00' : '#00d4aa';
            dotEl.title = 'AMT online' + (rStatus.amtVersion ? ' (v' + rStatus.amtVersion + ')' : '');
        } else {
            dotEl.style.background = '#555';
            dotEl.title = 'AMT offline';
        }
    }
}

function computerConnect(e, h, m, skipPass) {
    if (xxdialogMode) return;
    if (e) haltEvent(e);
    computerSelect(null, h);
    if (currentcomputer == null) return;
    if ((currentcomputer['user'] != '*') && (currentcomputer['pass'] == '')) {
        if (skipPass === true) { computerConnectLogin(9, m); return; }
        var x = '<br>Enter the login password for ' + EscapeHtml(currentcomputer['name'] ? currentcomputer['name'] : currentcomputer['host']) + '.<br><br>';
        x += '<div style=height:26px><input id=d11connectUser onkeyup=computerConnectUpdateLogin() style=float:right;width:200px value="' + currentcomputer['user'] + '"><div>Username</div></div>';
        x += '<div style=height:26px><input id=d11connectPass onkeyup=computerConnectUpdateLogin(event) type=password style=float:right;width:200px><div>Password</div></div>';
        setDialogMode(11, "Login Credentials", 3, computerConnectLogin, x);
        Q('d11connectPass').focus();
        computerConnectUpdateLogin();
    } else {
        computerConnectLogin(0, m);
    }
}

function computerConnectUpdateLogin(e) {
    var ok = (Q('d11connectUser').value.length > 0) && (passwordcheck(Q('d11connectPass').value));
    QE('idx_dlgOkButton', ok);
    if ((e != undefined) && (e.keyCode == 13) && (ok == true)) { setDialogMode(0); computerConnectLogin(1, xxdialogTag); }
}

var skipPassUser = null, skipPassPass = null;
function computerConnectLogin(button, m) {
    var user = decodeURIComponent(currentcomputer['user']);
    var pass = decodeURIComponent(currentcomputer['pass']);
    if (button == 1) { user = Q('d11connectUser').value; pass = Q('d11connectPass').value; }
    if (button == 9) { user = skipPassUser; pass = skipPassPass; }
    skipPassUser = user; skipPassPass = pass;
    var ports = portsFromHost(currentcomputer['host'], currentcomputer['tls']);
    if (user == '') { user = 'admin'; }
    connect(ports.host, ports.http, user, pass, currentcomputer['tls'], function (mtag) {
        if (mtag == 1) { go(14); connectDesktop(); }
    }, m);
    if (m == 1) { go(14); }
}

function computerSelect(e, h) {
    if (h && ((currentcomputer == null) || (currentcomputer.h !== h))) { currentcomputer = getComputer(h); updateComputerDetails(); }
    for (var y in computerlist) {
        var computer = computerlist[y], sel = (currentcomputer != null && computer['h'] == currentcomputer['h']);
        QS('CI-' + computer['h'])['background-color'] = sel ? '#1a3a5c' : '#1e2d4a';
        QS('CI-' + computer['h'])['border'] = sel ? '1px solid #00d4aa' : '1px solid transparent';
    }
}

function getComputer(h) { for (var i in computerlist) { if (computerlist[i]['h'] == h) return computerlist[i]; } return null; }

// ========== OPEN / SAVE COMPUTER LIST ==========

function openComputerList() {
    if (xxdialogMode) return;
    setDialogMode(17, "Open Computer List", 3, openComputerListOk);
}

function openComputerListOk(r) {
    if (r != 1) return;
    var x = Q('idx_d17computerlistfile');
    if (x.files.length != 1) return;
    var reader = new FileReader();
    reader.onload = function(file) { onComputerListRead(file, Q('idx_d17computerlistfile').files[0].name); }
    reader.readAsBinaryString(x.files[0]);
}

function onComputerListRead(file, name) {
    var x;
    if (name.toLowerCase().endsWith('.csv')) {
        x = { computers: [] };
        var lines = file.target.result.split('\r\n').join('\n').split('\n'), headers = {};
        for (var i in lines) {
            var values = lines[i].split(',');
            if (i == 0) { for (var j in values) { if (values[j] == 'Intel AMT FQDN') headers[j] = 'name'; if (values[j] == 'Intel AMT IPv4') headers[j] = 'host'; } }
            else { var ce = {}; for (var j in values) { if (headers[j] && values[j].length > 0) ce[headers[j]] = values[j]; } if (ce.host || ce.name) { if (!ce.host) ce.host = ce.name; if (!ce.user) ce.user = 'admin'; if (!ce.pass) ce.pass = ''; if (!ce.tls) ce.tls = 1; x.computers.push(ce); } }
        }
    } else {
        try { x = JSON.parse(file.target.result); } catch (ex) { }
    }
    if (!x || !x['computers']) { messagebox("Open File", "Invalid or corrupt computer list file."); }
    else {
        currentcomputer = null; computerlist = x['computers'];
        for (var i in computerlist) { computerlist[i]['h'] = Math.random(); computerlist[i].checked = false; }
        updateComputerList(); saveComputers();
    }
}

function saveComputerList() {
    if (xxdialogMode) return;
    setDialogMode(18, "Save Computer List", 3, function() {
        var cl2 = Clone(computerlist);
        for (var i in cl2) { delete cl2[i]['h']; delete cl2[i].checked; }
        saveAs(data2blob(JSON.stringify({ 'webappversion': version, 'computers': cl2 }, null, '  ').replace(/\n/g, '\r\n')), idx_d18computerfilename.value);
    });
}

function documentFileSelectHandler(e) { haltEvent(e); }

// ========== DIALOG SYSTEM ==========

function setDialogMode(x, y, b, f, c, tag) {
    xxdialogMode = x; xxdialogFunc = f; xxdialogButtons = b; xxdialogTag = tag;
    QE('idx_dlgOkButton', true);
    QV('idx_dlgOkButton', b & 1); QV('idx_dlgCancelButton', b & 2); QV('id_dialogclose', b & 2); QV('idx_dlgDeleteButton', b & 4);
    if (y) QH('id_dialogtitle', y);
    for (var i = 1; i < 28; i++) { QV('dialog' + i, i == x); }
    QV('dialog', x);
    if (c) { if (x == 11) QH('id_dialogOptions', c); else QH('id_dialogMessage', c); }
}

function dialogclose(x) {
    var f = xxdialogFunc, b = xxdialogButtons, t = xxdialogTag;
    setDialogMode();
    if (((b & 8) || x) && f) f(x, t);
}

function center() {
    QS('dialog').left = ((((getDocWidth() - 400) / 2)) + 'px');
    // Calculate height taken by warning banners above id_mainarea_pad
    var warningH = 0;
    var tlsW = Q('id_tlsWarning'), verW = Q('id_versionWarning');
    if (tlsW && tlsW.style.display !== 'none') warningH += tlsW.offsetHeight;
    if (verW && verW.style.display !== 'none') warningH += verW.offsetHeight;
    var sh = 0, mh = (Q('id_mainarea').offsetHeight - warningH - ((fullscreen == false)?126:0));
    QS('id_mainarea_pad').height = (Q('id_mainarea').offsetHeight - sh - warningH - ((fullscreen == false)?16:0)) + 'px';
    if (fullscreen) {
        // Fill the entire screen while maintaining aspect ratio
        var aw = window.innerWidth, ah = window.innerHeight - warningH;
        var desk = Q('Desk'), cw = desk.width, ch = desk.height;
        var scale = Math.min(aw / cw, ah / ch);
        var sw = Math.round(cw * scale), sh2 = Math.round(ch * scale);
        QS('Desk')['max-height'] = ''; QS('Desk')['max-width'] = '';
        QS('Desk').width = sw + 'px'; QS('Desk').height = sh2 + 'px';
        QS('id_mainarea_pad')['overflow-y'] = 'hidden';
        var h = (ah - sh2) / 2;
        QS('Desk')['margin-top'] = h + 'px'; QS('Desk')['margin-bottom'] = h + 'px';
        var marginLeft = (aw - sw) / 2;
        QS('Desk')['margin-left'] = marginLeft + 'px'; QS('Desk')['margin-right'] = marginLeft + 'px';
    } else {
        // Scale canvas to fill available area while maintaining aspect ratio
        // Subtract height of UI elements around the canvas (header, toolbars, padding)
        var uiH = 0;
        var rdH = Q('id_rdheader'); if (rdH && rdH.style.display !== 'none') uiH += rdH.offsetHeight;
        var topBar = Q('id_kvmTopBar'); if (topBar && topBar.style.display !== 'none') uiH += topBar.offsetHeight;
        var botBar = Q('id_kvmBottomBar'); if (botBar && botBar.style.display !== 'none') uiH += botBar.offsetHeight;
        uiH += 16; // padding of id_mainarea_pad (8px top + 8px bottom)
        var aw = Q('id_DeskParent').offsetWidth || (Q('id_mainarea').offsetWidth - 32);
        var ah = Q('id_mainarea').offsetHeight - warningH - uiH;
        var desk = Q('Desk'), cw = desk.width, ch = desk.height;
        if (cw > 0 && ch > 0 && aw > 0 && ah > 0) {
            var scale = Math.min(aw / cw, ah / ch);
            var sw = Math.round(cw * scale), sh2 = Math.round(ch * scale);
            QS('Desk')['max-height'] = ''; QS('Desk')['max-width'] = '';
            QS('Desk').width = sw + 'px'; QS('Desk').height = sh2 + 'px';
        } else {
            QS('Desk')['max-height'] = ah + 'px';
            QS('Desk')['max-width'] = aw + 'px';
            QS('Desk').width = ''; QS('Desk').height = '';
        }
        QS('id_mainarea_pad')['overflow-y'] = 'hidden';
        QS('Desk')['margin-top'] = '0'; QS('Desk')['margin-bottom'] = '0';
        QS('Desk')['margin-left'] = '0px'; QS('Desk')['margin-right'] = '';
    }
}

function messagebox(t, m) { QH('id_dialogMessage', m); setDialogMode(1, t, 1); }
function statusbox(t, m) { QH('id_dialogMessage', m); setDialogMode(1, t); }

function errcheck(s, stack) {
    if (wsstack == null || amtstack != stack) return true;
    if (s != 200 && s != 9) {
        setDialogMode();
        wsstack.comm.FailAllError = 999;
        amtstack.CancelAllQueries(999);
        QH('id_messageviewstr', ((httpErrorTable[s])?(httpErrorTable[s]):(format("Error #{0}", s))));
        go(100);
        Q('id_messageviewbutton').focus();
    }
    return (s != 200);
}

// ========== NAVIGATION ==========

function go(x, force) {
    if (xxdialogMode && force != 1) return;
    QV('id_computerSelector', x == 101);
    QV('id_messageview', x == 100);
    QV('id_mainview', x < 100);
    for (var i = 0; i < 80; i++) {
        QV('p' + i, i == x);
        var q = QS('go' + i);
        if (q) { q['background-color'] = ((i == x)?'var(--item-hover)':''); }
    }
    currentView = x;
    center();
}

// ========== CONTEXT MENU ==========

function handleContextMenu(e) {
    hideContextMenu();
    if (xxdialogMode) return;
    var cm = document.elementFromPoint(e.pageX, e.pageY);
    while (cm && cm != null && cm.getAttribute('cm') == null) { cm = cm.parentElement; }
    if (cm && cm != null && cm.getAttribute('cm') != null) {
        var x = '', menus = cm.getAttribute('cm').split('|');
        for (var i in menus) {
            if (menus[i] == '-') x += '<hr style="border:1px solid lightgray" />';
            else { var m2 = menus[i].split('#'); x += '<div class=cmtext onclick="hideContextMenu();' + m2[1] + '"><b>' + m2[0] + '</b></div>'; }
        }
        QS('contextMenu').top = e.pageY + 'px'; QS('contextMenu').left = e.pageX + 'px';
        QH('contextMenu', x); QV('contextMenu', true);
        haltEvent(e); return false;
    }
}
function hideContextMenu() { QV('contextMenu', false); }

// ========== UTILITY FUNCTIONS ==========

function portsFromHost(host, tls) {
    host = decodeURIComponent(host);
    var x = host.split(':'), hp = ((tls == 0) ? 16992 : 16993), rp = ((tls == 0) ? 16994 : 16995);
    if (x.length > 1) { hp = parseInt(x[1]); }
    if (x.length > 2) { rp = parseInt(x[2]); }
    return { host: x[0], http: hp, redir: rp };
}

function addLink(x, f) { return '<a style=cursor:pointer;color:var(--accent) onclick=\'' + f + '\'>&diams; ' + x + '</a>'; }
function addLinkConditional(x, f, c) { if (c) return addLink(x, f); return x; }
function haltEvent(e) { if (e.preventDefault) e.preventDefault(); if (e.stopPropagation) e.stopPropagation(); return false; }
function addOption(q, t, i) { var option = document.createElement('option'); option.text = t; option.value = i; Q(q).add(option); }
function passwordcheck(p) { if (p.length < 8) return false; var u=0,l=0,n=0,s=0; for (var i in p) { var c = p.charCodeAt(i); if (c>64&&c<91) u=1; else if (c>96&&c<123) l=1; else if (c>47&&c<58) n=1; else s=1; } return (u+l+n+s)==4; }
function methodcheck(r) { if (r && r != null && r.Body && r.Body['ReturnValue'] != 0) { messagebox("Call Error", r.Header['Method'] + ': ' + (r.Body.ReturnValueStr + '').replace('_', ' ')); return true; } return false; }
function TableStart() { return '<table class=\'log1 us\' cellpadding=0 cellspacing=0 style=width:100%;border-radius:8px><tr><td width=200px><p><td>'; }
function TableEntry(n, v) { return '<tr><td class=r1><p>' + n + '<td class=r1>' + v; }
function TableEnd(n) { return '<tr><td colspan=2><p>' + (n?n:'') + '</table>'; }
function AddButton(v, f) { return '<input type=button value=\'' + v + '\' onclick=\'' + f + '\' style=margin:4px>'; }
function AddButton2(v, f, s) { return '<input type=button value=\'' + v + '\' onclick=\'' + f + '\' ' + (s||'') + '>'; }
function AddRefreshButton(f) { return '<input type=button name=refreshbtn value="Refresh" onclick=\'refreshButtons(false);' + f + '\' style=margin:4px ' + (refreshButtonsState==false?'disabled':'') + '>'; }
function refreshButtons(x) { if (refreshButtonsState == x) return; refreshButtonsState = x; var i = 0, e = document.getElementsByTagName('input'); for (; i < e.length; i++) { if (e[i].name == 'refreshbtn') e[i].disabled = !x; } }
function getInstance(x, y) { for (var i in x) { if (x[i]['InstanceID'] == y) return x[i]; } return null; }
function getItem(x, y, z) { for (var i in x) { if (x[i][y] == z) return x[i]; } return null; }
function getDocWidth() { if (window.innerWidth) return window.innerWidth; if (document.documentElement && document.documentElement.clientWidth) return document.documentElement.clientWidth; return document.getElementsByTagName('body')[0].clientWidth; }
function getDocHeight() { if (window.innerHeight) return window.innerHeight; if (document.documentElement && document.documentElement.clientHeight) return document.documentElement.clientHeight; return document.getElementsByTagName('body')[0].clientHeight; }
function getUrlVars() { var j, hash, vars = [], hashes = window.location.href.slice(window.location.href.indexOf('?') + 1).split('&'); for (var i = 0; i < hashes.length; i++) { j = hashes[i].indexOf('='); if (j > 0) vars[hashes[i].substring(0, j)] = hashes[i].substring(j + 1); } return vars; }
function numbersOnly(e, x) { return (event.charCode == 0) || (event.charCode == x) || (event.charCode >= 48 && event.charCode <= 57); }
function data2blob(data) { var bytes = new Array(data.length); for (var i = 0; i < data.length; i++) bytes[i] = data.charCodeAt(i); return new Blob([new Uint8Array(bytes)]); }
function format(fmt) { var args = Array.prototype.slice.call(arguments, 1); return fmt.replace(/{(\d+)}/g, function (m, n) { return typeof args[n] != 'undefined' ? args[n] : m; }); }
function NoBreak(v) { return v.split(' ').join('&nbsp;'); }
function trademarks(x) { return x.replace(/\(R\)/g, '&reg;').replace(/\(TM\)/g, '&trade;'); }
function makeUefiBootParam(type, data, len, vendorid) { if (typeof data == 'number') { if (len == 1) data = String.fromCharCode(data & 0xFF); if (len == 2) data = ShortToStrX(data); if (len == 4) data = IntToStrX(data); } return ShortToStrX(vendorid ? vendorid : 0x8086) + ShortToStrX(type) + IntToStrX(data.length) + data; }

function consentChanged() { QE('idx_dlgOkButton', d6ConsentText.value.length == 6); }
function changeConsentDisplay() { }

// ========== PASTE, COPY (VGA FONT OCR), AND KEYBOARD MAPPING ==========

// Paste dialog - opens a textarea where user can Ctrl+V paste text, then send to remote
// showPasteDialog, closePasteDialog, sendPasteText defined in kvm.js

// Paste keyboard mapping: char → [keysym, shift, altgr]
// Auto-detected layout via getLayoutMap() + hardcoded shift/altgr pairs
var kvmPasteMap = {};
var kvmCodeToKeysym = {'Quote':39,'Minus':45,'Comma':44,'Period':46,'Slash':47,'Semicolon':59,'Equal':61,'BracketLeft':91,'Backslash':92,'BracketRight':93,'Backquote':96,'IntlBackslash':0x17170056,'Space':32};
// Shift pairs per layout: code → shifted char
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
function kvmBuildPasteMap() {
    if (!navigator.keyboard || !navigator.keyboard.getLayoutMap) return;
    navigator.keyboard.getLayoutMap().then(function(lm) {
        // Detect layout from key signatures
        var layout = 'us';
        if (lm.get('Minus') === "'" && lm.get('Slash') === '-') layout = 'pt';
        // Unshifted chars
        lm.forEach(function(ch, code) {
            var ks = kvmGetKeysymForCode(code);
            if (ks !== undefined) kvmPasteMap[ch] = [ks, false, false];
        });
        // Uppercase letters
        for (var c = 65; c <= 90; c++) {
            var lo = String.fromCharCode(c + 32);
            if (kvmPasteMap[lo]) kvmPasteMap[String.fromCharCode(c)] = [kvmPasteMap[lo][0], true, false];
        }
        // Shifted chars
        var sp = kvmLayoutShift[layout] || {};
        for (var code in sp) { var ks = kvmGetKeysymForCode(code); if (ks !== undefined) kvmPasteMap[sp[code]] = [ks, true, false]; }
        // AltGr chars
        var ag = kvmLayoutShift[layout + '_altgr'] || {};
        for (var code in ag) { var ks = kvmGetKeysymForCode(code); if (ks !== undefined) kvmPasteMap[ag[code]] = [ks, false, true]; }
        // PT unshifted special chars (fallback if getLayoutMap missed them)
        if (layout === 'pt') {
            if (!kvmPasteMap['\u00e7']) kvmPasteMap['\u00e7'] = [59, false, false]; // ç = Semicolon
            if (!kvmPasteMap['\u00ba']) kvmPasteMap['\u00ba'] = [39, false, false]; // º = Quote
            if (!kvmPasteMap['\u00ab']) kvmPasteMap['\u00ab'] = [61, false, false]; // « = Equal
        }
        console.log('Paste map: ' + layout + ', ' + Object.keys(kvmPasteMap).length + ' chars');
    }).catch(function(e) { console.log('getLayoutMap failed:', e); });
}
kvmBuildPasteMap();
// Also learn from typing (enhances map with any missing chars)
document.addEventListener('keydown', function(e) {
    if (!e.key || e.key.length != 1 || !e.code || e.metaKey) return;
    var ks = kvmGetKeysymForCode(e.code);
    if (ks === undefined) return;
    if (e.altKey && e.ctrlKey) kvmPasteMap[e.key] = [ks, false, true];
    else if (e.shiftKey && !e.ctrlKey && !e.altKey) kvmPasteMap[e.key] = [ks, true, false];
    else if (!e.shiftKey && !e.ctrlKey && !e.altKey) kvmPasteMap[e.key] = [ks, false, false];
});

function kvmTypeText(text) {
    if (desktop.State != 3 || !text || text.length == 0) return;
    // Also try RFB ClientCutText (type 6)
    try {
        var clipMsg = String.fromCharCode(6, 0, 0, 0) + IntToStr(text.length) + text;
        desktop.m.send(clipMsg);
    } catch(e) {}
    // Send as keystrokes using physical key codes from layout map
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
            // PT dead keys: ~ (Backslash), ^ (shift+Backslash), ` (shift+BracketRight), ´ (BracketRight)
            var deadKeyMap = {'~':[92,false], '^':[92,true], '`':[93,true], '\u00b4':[93,false]};
            if (deadKeyMap[ch]) {
                var dk = deadKeyMap[ch];
                if (dk[1]) keys.push([0xffe1, 1]);
                keys.push([dk[0], 1]); keys.push([dk[0], 0]);
                if (dk[1]) keys.push([0xffe1, 0]);
                keys.push([32, 1]); keys.push([32, 0]); // space to commit
                continue;
            } else if (kvmPasteMap[ch]) {
                keysym = kvmPasteMap[ch][0]; needShift = kvmPasteMap[ch][1]; needAltGr = kvmPasteMap[ch][2];
            } else {
                // Unicode char > 255 without mapping - skip
                continue;
            }
            if (needAltGr) keys.push([0xffea, 1]);
            if (needShift) keys.push([0xffe1, 1]);
            keys.push([keysym, 1]); keys.push([keysym, 0]);
            if (needShift) keys.push([0xffe1, 0]);
            if (needAltGr) keys.push([0xffea, 0]);
        }
    }
    // Send one character at a time (key down + key up + modifiers = one group)
    var charGroups = [];
    var group = [];
    for (var k = 0; k < keys.length; k++) {
        group.push(keys[k]);
        // A group ends when we release the main key (non-modifier key up)
        if (keys[k][1] === 0 && keys[k][0] < 0xff00) {
            // Flush remaining modifier releases
            while (k + 1 < keys.length && keys[k + 1][0] >= 0xff00 && keys[k + 1][1] === 0) {
                k++; group.push(keys[k]);
            }
            charGroups.push(group); group = [];
        }
    }
    if (group.length > 0) charGroups.push(group);
    var ci = 0;
    function sendNext() {
        if (ci >= charGroups.length || desktop.State != 3) return;
        desktop.m.sendkey(charGroups[ci]);
        ci++;
        if (ci < charGroups.length) setTimeout(sendNext, 15);
    }
    sendNext();
}

// VGA 8x16 font bitmaps for template matching (128 ASCII chars, 16 bytes each)
var VGA_FONT=[[0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00],[0x00,0x00,0x7E,0x81,0xA5,0x81,0x81,0xBD,0x99,0x81,0x81,0x7E,0x00,0x00,0x00,0x00],[0x00,0x00,0x7E,0xFF,0xDB,0xFF,0xFF,0xC3,0xE7,0xFF,0xFF,0x7E,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x6C,0xFE,0xFE,0xFE,0xFE,0x7C,0x38,0x10,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x10,0x38,0x7C,0xFE,0x7C,0x38,0x10,0x00,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x18,0x3C,0x3C,0xE7,0xE7,0xE7,0x18,0x18,0x3C,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x18,0x3C,0x7E,0xFF,0xFF,0x7E,0x18,0x18,0x3C,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x00,0x00,0x18,0x3C,0x3C,0x18,0x00,0x00,0x00,0x00,0x00,0x00],[0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xE7,0xC3,0xC3,0xE7,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF],[0x00,0x00,0x00,0x00,0x00,0x3C,0x66,0x42,0x42,0x66,0x3C,0x00,0x00,0x00,0x00,0x00],[0xFF,0xFF,0xFF,0xFF,0xFF,0xC3,0x99,0xBD,0xBD,0x99,0xC3,0xFF,0xFF,0xFF,0xFF,0xFF],[0x00,0x00,0x1E,0x0E,0x1A,0x32,0x78,0xCC,0xCC,0xCC,0xCC,0x78,0x00,0x00,0x00,0x00],[0x00,0x00,0x3C,0x66,0x66,0x66,0x66,0x3C,0x18,0x7E,0x18,0x18,0x00,0x00,0x00,0x00],[0x00,0x00,0x3F,0x33,0x3F,0x30,0x30,0x30,0x30,0x70,0xF0,0xE0,0x00,0x00,0x00,0x00],[0x00,0x00,0x7F,0x63,0x7F,0x63,0x63,0x63,0x63,0x67,0xE7,0xE6,0xC0,0x00,0x00,0x00],[0x00,0x00,0x00,0x18,0x18,0xDB,0x3C,0xE7,0x3C,0xDB,0x18,0x18,0x00,0x00,0x00,0x00],[0x00,0x80,0xC0,0xE0,0xF0,0xF8,0xFE,0xF8,0xF0,0xE0,0xC0,0x80,0x00,0x00,0x00,0x00],[0x00,0x02,0x06,0x0E,0x1E,0x3E,0xFE,0x3E,0x1E,0x0E,0x06,0x02,0x00,0x00,0x00,0x00],[0x00,0x00,0x18,0x3C,0x7E,0x18,0x18,0x18,0x7E,0x3C,0x18,0x00,0x00,0x00,0x00,0x00],[0x00,0x00,0x66,0x66,0x66,0x66,0x66,0x66,0x66,0x00,0x66,0x66,0x00,0x00,0x00,0x00],[0x00,0x00,0x7F,0xDB,0xDB,0xDB,0x7B,0x1B,0x1B,0x1B,0x1B,0x1B,0x00,0x00,0x00,0x00],[0x00,0x7C,0xC6,0x60,0x38,0x6C,0xC6,0xC6,0x6C,0x38,0x0C,0xC6,0x7C,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0xFE,0xFE,0xFE,0xFE,0x00,0x00,0x00,0x00],[0x00,0x00,0x18,0x3C,0x7E,0x18,0x18,0x18,0x7E,0x3C,0x18,0x7E,0x00,0x00,0x00,0x00],[0x00,0x00,0x18,0x3C,0x7E,0x18,0x18,0x18,0x18,0x18,0x18,0x18,0x00,0x00,0x00,0x00],[0x00,0x00,0x18,0x18,0x18,0x18,0x18,0x18,0x18,0x7E,0x3C,0x18,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x00,0x18,0x0C,0xFE,0x0C,0x18,0x00,0x00,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x00,0x30,0x60,0xFE,0x60,0x30,0x00,0x00,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x00,0x00,0xC0,0xC0,0xC0,0xFE,0x00,0x00,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x00,0x28,0x6C,0xFE,0x6C,0x28,0x00,0x00,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x10,0x38,0x38,0x7C,0x7C,0xFE,0xFE,0x00,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0xFE,0xFE,0x7C,0x7C,0x38,0x38,0x10,0x00,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00],[0x00,0x00,0x18,0x3C,0x3C,0x3C,0x18,0x18,0x18,0x00,0x18,0x18,0x00,0x00,0x00,0x00],[0x00,0x66,0x66,0x66,0x24,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x6C,0x6C,0xFE,0x6C,0x6C,0x6C,0xFE,0x6C,0x6C,0x00,0x00,0x00,0x00],[0x18,0x18,0x7C,0xC6,0xC2,0xC0,0x7C,0x06,0x06,0x86,0xC6,0x7C,0x18,0x18,0x00,0x00],[0x00,0x00,0x00,0x00,0xC2,0xC6,0x0C,0x18,0x30,0x60,0xC6,0x86,0x00,0x00,0x00,0x00],[0x00,0x00,0x38,0x6C,0x6C,0x38,0x76,0xDC,0xCC,0xCC,0xCC,0x76,0x00,0x00,0x00,0x00],[0x00,0x30,0x30,0x30,0x60,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00],[0x00,0x00,0x0C,0x18,0x30,0x30,0x30,0x30,0x30,0x30,0x18,0x0C,0x00,0x00,0x00,0x00],[0x00,0x00,0x30,0x18,0x0C,0x0C,0x0C,0x0C,0x0C,0x0C,0x18,0x30,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x00,0x66,0x3C,0xFF,0x3C,0x66,0x00,0x00,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x00,0x18,0x18,0x7E,0x18,0x18,0x00,0x00,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x18,0x18,0x18,0x30,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x00,0x00,0x00,0xFE,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x18,0x18,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x02,0x06,0x0C,0x18,0x30,0x60,0xC0,0x80,0x00,0x00,0x00,0x00],[0x00,0x00,0x38,0x6C,0xC6,0xC6,0xD6,0xD6,0xC6,0xC6,0x6C,0x38,0x00,0x00,0x00,0x00],[0x00,0x00,0x18,0x38,0x78,0x18,0x18,0x18,0x18,0x18,0x18,0x7E,0x00,0x00,0x00,0x00],[0x00,0x00,0x7C,0xC6,0x06,0x0C,0x18,0x30,0x60,0xC0,0xC6,0xFE,0x00,0x00,0x00,0x00],[0x00,0x00,0x7C,0xC6,0x06,0x06,0x3C,0x06,0x06,0x06,0xC6,0x7C,0x00,0x00,0x00,0x00],[0x00,0x00,0x0C,0x1C,0x3C,0x6C,0xCC,0xFE,0x0C,0x0C,0x0C,0x1E,0x00,0x00,0x00,0x00],[0x00,0x00,0xFE,0xC0,0xC0,0xC0,0xFC,0x06,0x06,0x06,0xC6,0x7C,0x00,0x00,0x00,0x00],[0x00,0x00,0x38,0x60,0xC0,0xC0,0xFC,0xC6,0xC6,0xC6,0xC6,0x7C,0x00,0x00,0x00,0x00],[0x00,0x00,0xFE,0xC6,0x06,0x06,0x0C,0x18,0x30,0x30,0x30,0x30,0x00,0x00,0x00,0x00],[0x00,0x00,0x7C,0xC6,0xC6,0xC6,0x7C,0xC6,0xC6,0xC6,0xC6,0x7C,0x00,0x00,0x00,0x00],[0x00,0x00,0x7C,0xC6,0xC6,0xC6,0x7E,0x06,0x06,0x06,0x0C,0x78,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x18,0x18,0x00,0x00,0x00,0x18,0x18,0x00,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x18,0x18,0x00,0x00,0x00,0x18,0x18,0x30,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x06,0x0C,0x18,0x30,0x60,0x30,0x18,0x0C,0x06,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x00,0x7E,0x00,0x00,0x7E,0x00,0x00,0x00,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x60,0x30,0x18,0x0C,0x06,0x0C,0x18,0x30,0x60,0x00,0x00,0x00,0x00],[0x00,0x00,0x7C,0xC6,0xC6,0x0C,0x18,0x18,0x18,0x00,0x18,0x18,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x7C,0xC6,0xC6,0xDE,0xDE,0xDE,0xDC,0xC0,0x7C,0x00,0x00,0x00,0x00],[0x00,0x00,0x10,0x38,0x6C,0xC6,0xC6,0xFE,0xC6,0xC6,0xC6,0xC6,0x00,0x00,0x00,0x00],[0x00,0x00,0xFC,0x66,0x66,0x66,0x7C,0x66,0x66,0x66,0x66,0xFC,0x00,0x00,0x00,0x00],[0x00,0x00,0x3C,0x66,0xC2,0xC0,0xC0,0xC0,0xC0,0xC2,0x66,0x3C,0x00,0x00,0x00,0x00],[0x00,0x00,0xF8,0x6C,0x66,0x66,0x66,0x66,0x66,0x66,0x6C,0xF8,0x00,0x00,0x00,0x00],[0x00,0x00,0xFE,0x66,0x62,0x68,0x78,0x68,0x60,0x62,0x66,0xFE,0x00,0x00,0x00,0x00],[0x00,0x00,0xFE,0x66,0x62,0x68,0x78,0x68,0x60,0x60,0x60,0xF0,0x00,0x00,0x00,0x00],[0x00,0x00,0x3C,0x66,0xC2,0xC0,0xC0,0xDE,0xC6,0xC6,0x66,0x3A,0x00,0x00,0x00,0x00],[0x00,0x00,0xC6,0xC6,0xC6,0xC6,0xFE,0xC6,0xC6,0xC6,0xC6,0xC6,0x00,0x00,0x00,0x00],[0x00,0x00,0x3C,0x18,0x18,0x18,0x18,0x18,0x18,0x18,0x18,0x3C,0x00,0x00,0x00,0x00],[0x00,0x00,0x1E,0x0C,0x0C,0x0C,0x0C,0x0C,0xCC,0xCC,0xCC,0x78,0x00,0x00,0x00,0x00],[0x00,0x00,0xE6,0x66,0x66,0x6C,0x78,0x78,0x6C,0x66,0x66,0xE6,0x00,0x00,0x00,0x00],[0x00,0x00,0xF0,0x60,0x60,0x60,0x60,0x60,0x60,0x62,0x66,0xFE,0x00,0x00,0x00,0x00],[0x00,0x00,0xC6,0xEE,0xFE,0xFE,0xD6,0xC6,0xC6,0xC6,0xC6,0xC6,0x00,0x00,0x00,0x00],[0x00,0x00,0xC6,0xE6,0xF6,0xFE,0xDE,0xCE,0xC6,0xC6,0xC6,0xC6,0x00,0x00,0x00,0x00],[0x00,0x00,0x7C,0xC6,0xC6,0xC6,0xC6,0xC6,0xC6,0xC6,0xC6,0x7C,0x00,0x00,0x00,0x00],[0x00,0x00,0xFC,0x66,0x66,0x66,0x7C,0x60,0x60,0x60,0x60,0xF0,0x00,0x00,0x00,0x00],[0x00,0x00,0x7C,0xC6,0xC6,0xC6,0xC6,0xC6,0xC6,0xD6,0xDE,0x7C,0x0C,0x0E,0x00,0x00],[0x00,0x00,0xFC,0x66,0x66,0x66,0x7C,0x6C,0x66,0x66,0x66,0xE6,0x00,0x00,0x00,0x00],[0x00,0x00,0x7C,0xC6,0xC6,0x60,0x38,0x0C,0x06,0xC6,0xC6,0x7C,0x00,0x00,0x00,0x00],[0x00,0x00,0x7E,0x7E,0x5A,0x18,0x18,0x18,0x18,0x18,0x18,0x3C,0x00,0x00,0x00,0x00],[0x00,0x00,0xC6,0xC6,0xC6,0xC6,0xC6,0xC6,0xC6,0xC6,0xC6,0x7C,0x00,0x00,0x00,0x00],[0x00,0x00,0xC6,0xC6,0xC6,0xC6,0xC6,0xC6,0xC6,0x6C,0x38,0x10,0x00,0x00,0x00,0x00],[0x00,0x00,0xC6,0xC6,0xC6,0xC6,0xD6,0xD6,0xD6,0xFE,0xEE,0x6C,0x00,0x00,0x00,0x00],[0x00,0x00,0xC6,0xC6,0x6C,0x7C,0x38,0x38,0x7C,0x6C,0xC6,0xC6,0x00,0x00,0x00,0x00],[0x00,0x00,0x66,0x66,0x66,0x66,0x3C,0x18,0x18,0x18,0x18,0x3C,0x00,0x00,0x00,0x00],[0x00,0x00,0xFE,0xC6,0x86,0x0C,0x18,0x30,0x60,0xC2,0xC6,0xFE,0x00,0x00,0x00,0x00],[0x00,0x00,0x3C,0x30,0x30,0x30,0x30,0x30,0x30,0x30,0x30,0x3C,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x80,0xC0,0xE0,0x70,0x38,0x1C,0x0E,0x06,0x02,0x00,0x00,0x00,0x00],[0x00,0x00,0x3C,0x0C,0x0C,0x0C,0x0C,0x0C,0x0C,0x0C,0x0C,0x3C,0x00,0x00,0x00,0x00],[0x10,0x38,0x6C,0xC6,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0xFF,0x00,0x00],[0x30,0x30,0x18,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x00,0x78,0x0C,0x7C,0xCC,0xCC,0xCC,0x76,0x00,0x00,0x00,0x00],[0x00,0x00,0xE0,0x60,0x60,0x78,0x6C,0x66,0x66,0x66,0x66,0x7C,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x00,0x7C,0xC6,0xC0,0xC0,0xC0,0xC6,0x7C,0x00,0x00,0x00,0x00],[0x00,0x00,0x1C,0x0C,0x0C,0x3C,0x6C,0xCC,0xCC,0xCC,0xCC,0x76,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x00,0x7C,0xC6,0xFE,0xC0,0xC0,0xC6,0x7C,0x00,0x00,0x00,0x00],[0x00,0x00,0x38,0x6C,0x64,0x60,0xF0,0x60,0x60,0x60,0x60,0xF0,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x00,0x76,0xCC,0xCC,0xCC,0xCC,0xCC,0x7C,0x0C,0xCC,0x78,0x00],[0x00,0x00,0xE0,0x60,0x60,0x6C,0x76,0x66,0x66,0x66,0x66,0xE6,0x00,0x00,0x00,0x00],[0x00,0x00,0x18,0x18,0x00,0x38,0x18,0x18,0x18,0x18,0x18,0x3C,0x00,0x00,0x00,0x00],[0x00,0x00,0x06,0x06,0x00,0x0E,0x06,0x06,0x06,0x06,0x06,0x06,0x66,0x66,0x3C,0x00],[0x00,0x00,0xE0,0x60,0x60,0x66,0x6C,0x78,0x78,0x6C,0x66,0xE6,0x00,0x00,0x00,0x00],[0x00,0x00,0x38,0x18,0x18,0x18,0x18,0x18,0x18,0x18,0x18,0x3C,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x00,0xEC,0xFE,0xD6,0xD6,0xD6,0xD6,0xC6,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x00,0xDC,0x66,0x66,0x66,0x66,0x66,0x66,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x00,0x7C,0xC6,0xC6,0xC6,0xC6,0xC6,0x7C,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x00,0xDC,0x66,0x66,0x66,0x66,0x66,0x7C,0x60,0x60,0xF0,0x00],[0x00,0x00,0x00,0x00,0x00,0x76,0xCC,0xCC,0xCC,0xCC,0xCC,0x7C,0x0C,0x0C,0x1E,0x00],[0x00,0x00,0x00,0x00,0x00,0xDC,0x76,0x66,0x60,0x60,0x60,0xF0,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x00,0x7C,0xC6,0x60,0x38,0x0C,0xC6,0x7C,0x00,0x00,0x00,0x00],[0x00,0x00,0x10,0x30,0x30,0xFC,0x30,0x30,0x30,0x30,0x36,0x1C,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x00,0xCC,0xCC,0xCC,0xCC,0xCC,0xCC,0x76,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x00,0x66,0x66,0x66,0x66,0x66,0x3C,0x18,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x00,0xC6,0xC6,0xD6,0xD6,0xD6,0xFE,0x6C,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x00,0xC6,0x6C,0x38,0x38,0x38,0x6C,0xC6,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x00,0xC6,0xC6,0xC6,0xC6,0xC6,0xC6,0x7E,0x06,0x0C,0xF8,0x00],[0x00,0x00,0x00,0x00,0x00,0xFE,0xCC,0x18,0x30,0x60,0xC6,0xFE,0x00,0x00,0x00,0x00],[0x00,0x00,0x0E,0x18,0x18,0x18,0x70,0x18,0x18,0x18,0x18,0x0E,0x00,0x00,0x00,0x00],[0x00,0x00,0x18,0x18,0x18,0x18,0x00,0x18,0x18,0x18,0x18,0x18,0x00,0x00,0x00,0x00],[0x00,0x00,0x70,0x18,0x18,0x18,0x0E,0x18,0x18,0x18,0x18,0x70,0x00,0x00,0x00,0x00],[0x00,0x00,0x76,0xDC,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00],[0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00]];
// Copy text from KVM screen
var ocrSelecting = false, ocrOverlay = null, ocrStartX = 0, ocrStartY = 0;
function startOcrSelection() {
    if (desktop.State != 3) return;
    var canvas = Q('Desk');
    if (!canvas) return;
    ocrSelecting = true;
    // Create overlay for selection
    var parent = canvas.parentElement;
    var rect = canvas.getBoundingClientRect();
    ocrOverlay = document.createElement('div');
    ocrOverlay.id = 'ocrOverlay';
    // Position overlay fixed over the canvas (works regardless of parent overflow/scroll)
    ocrOverlay.style.cssText = 'position:fixed;top:' + rect.top + 'px;left:' + rect.left + 'px;width:' + rect.width + 'px;height:' + rect.height + 'px;cursor:crosshair;z-index:9999;user-select:none';
    document.body.appendChild(ocrOverlay);
    var selBox = document.createElement('div');
    selBox.id = 'ocrSelBox';
    selBox.style.cssText = 'position:absolute;border:2px dashed #4dd9c0;background:rgba(77,217,192,0.15);display:none;pointer-events:none';
    ocrOverlay.appendChild(selBox);
    // Status bar
    var status = document.createElement('div');
    status.id = 'ocrStatus';
    status.style.cssText = 'position:absolute;top:8px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.8);color:#4dd9c0;padding:6px 16px;border-radius:4px;font-size:13px;z-index:10000;pointer-events:none';
    status.textContent = 'Draw a rectangle over the text you want to copy';
    ocrOverlay.appendChild(status);
    ocrOverlay.addEventListener('mousedown', ocrMouseDown);
    ocrOverlay.addEventListener('mousemove', ocrMouseMove);
    ocrOverlay.addEventListener('mouseup', ocrMouseUp);
    ocrOverlay.addEventListener('keydown', function(e) { if (e.key === 'Escape') cancelOcrSelection(); });
    document.addEventListener('keydown', ocrEscHandler);
}
function ocrEscHandler(e) { if (e.key === 'Escape') cancelOcrSelection(); }
function cancelOcrSelection() {
    ocrSelecting = false;
    if (ocrOverlay) { ocrOverlay.remove(); ocrOverlay = null; }
    document.removeEventListener('keydown', ocrEscHandler);
}
function ocrMouseDown(e) {
    var r = ocrOverlay.getBoundingClientRect();
    ocrStartX = e.clientX - r.left; ocrStartY = e.clientY - r.top;
    var box = Q('ocrSelBox');
    box.style.left = ocrStartX + 'px'; box.style.top = ocrStartY + 'px';
    box.style.width = '0'; box.style.height = '0'; box.style.display = 'block';
}
function ocrMouseMove(e) {
    if (!Q('ocrSelBox') || Q('ocrSelBox').style.display === 'none') return;
    var r = ocrOverlay.getBoundingClientRect();
    var cx = e.clientX - r.left, cy = e.clientY - r.top;
    var box = Q('ocrSelBox');
    box.style.left = Math.min(ocrStartX, cx) + 'px'; box.style.top = Math.min(ocrStartY, cy) + 'px';
    box.style.width = Math.abs(cx - ocrStartX) + 'px'; box.style.height = Math.abs(cy - ocrStartY) + 'px';
}
function ocrMouseUp(e) {
    var r = ocrOverlay.getBoundingClientRect();
    var endX = e.clientX - r.left, endY = e.clientY - r.top;
    var selW = Math.abs(endX - ocrStartX), selH = Math.abs(endY - ocrStartY);
    if (selW < 10 || selH < 10) { cancelOcrSelection(); return; }
    // Convert overlay-relative coords to canvas-relative coords
    var canvas = Q('Desk');
    var canvasRect = canvas.getBoundingClientRect();
    var offX = r.left - canvasRect.left, offY = r.top - canvasRect.top;
    var x1 = Math.min(ocrStartX, endX) + offX;
    var y1 = Math.min(ocrStartY, endY) + offY;
    cancelOcrSelection();
    // Extract raw canvas pixels
    var dispW = canvas.clientWidth, dispH = canvas.clientHeight;
    var canW = canvas.width, canH = canvas.height;
    var sx = canW / dispW, sy = canH / dispH;
    var cellW = 8, cellH = 16;
    var rawX = x1 * sx, rawY = y1 * sy, rawW = selW * sx, rawH = selH * sy;
    var cx = Math.floor(rawX / cellW) * cellW;
    var cy = Math.floor(rawY / cellH) * cellH;
    var cx2 = Math.ceil((rawX + rawW) / cellW) * cellW;
    var cy2 = Math.ceil((rawY + rawH) / cellH) * cellH;
    if (cx2 > canW) cx2 = Math.floor(canW / cellW) * cellW;
    if (cy2 > canH) cy2 = Math.floor(canH / cellH) * cellH;
    var cw = cx2 - cx, ch = cy2 - cy;
    if (cw < cellW || ch < cellH) { messagebox('Copy', 'Selection too small'); return; }
    var tmpCanvas = document.createElement('canvas');
    tmpCanvas.width = cw; tmpCanvas.height = ch;
    var tmpCtx = tmpCanvas.getContext('2d');
    tmpCtx.drawImage(canvas, cx, cy, cw, ch, 0, 0, cw, ch);
    var pixels = tmpCtx.getImageData(0, 0, cw, ch);
    var d = pixels.data;
    // Template match against VGA 8x16 font
    var cols = Math.floor(cw / cellW), rows = Math.floor(ch / cellH);
    var lines = [];
    for (var row = 0; row < rows; row++) {
        var line = '';
        for (var col = 0; col < cols; col++) {
            var px = col * cellW, py = row * cellH;
            // Count pixel luminance to find bg/fg
            var lumCounts = {};
            for (var yy = 0; yy < cellH; yy++) {
                for (var xx = 0; xx < cellW; xx++) {
                    var i = ((py + yy) * cw + (px + xx)) * 4;
                    var lum = Math.round((0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2]) / 8) * 8;
                    lumCounts[lum] = (lumCounts[lum] || 0) + 1;
                }
            }
            // Find two most common luminances (bg = most common)
            var sorted = Object.keys(lumCounts).map(Number).sort(function(a,b) { return lumCounts[b] - lumCounts[a]; });
            var bgLum = sorted[0];
            var fgLum = sorted.length > 1 ? sorted[1] : (bgLum > 128 ? 0 : 255);
            var threshold = (bgLum + fgLum) / 2;
            var invert = bgLum > fgLum; // light bg, dark fg
            // Build binary bitmap (16 bytes, each byte = 8 pixels MSB first)
            var cellBits = [];
            for (var yy = 0; yy < cellH; yy++) {
                var b = 0;
                for (var xx = 0; xx < cellW; xx++) {
                    var i = ((py + yy) * cw + (px + xx)) * 4;
                    var lum = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];
                    var isFg = invert ? (lum < threshold) : (lum > threshold);
                    if (isFg) b |= (0x80 >> xx);
                }
                cellBits.push(b);
            }
            // Compare against all font characters
            var bestChar = 32, bestScore = -1;
            for (var ci = 32; ci < 127; ci++) {
                var score = 0;
                for (var bi = 0; bi < 16; bi++) {
                    var xor = cellBits[bi] ^ VGA_FONT[ci][bi];
                    // Count matching bits (128 - popcount of XOR)
                    var pc = xor; pc = pc - ((pc >> 1) & 0x55); pc = (pc & 0x33) + ((pc >> 2) & 0x33); pc = (pc + (pc >> 4)) & 0x0F;
                    score += 8 - pc;
                }
                if (score > bestScore) { bestScore = score; bestChar = ci; }
            }
            line += String.fromCharCode(bestChar);
        }
        lines.push(line.replace(/\s+$/, ''));
    }
    // Remove trailing empty lines
    while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
    var text = lines.join('\n');
    if (text.length > 0) {
        navigator.clipboard.writeText(text).then(function() {
            showOcrResult(text, true);
        }).catch(function() { showOcrResult(text, false); });
    } else {
        messagebox('Copy', 'No text found in selection');
    }
}
// showOcrResult defined in kvm.js

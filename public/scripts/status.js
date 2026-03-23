// ========== SYSTEM VERSION & STATUS ==========

function processSystemVersion(stack, name, responses, status) {
    if (status == 200 || status == 400) {
        var v;
        if (status == 200) {
            amtlogicalelements = [];
            if (responses != null) {
                if (responses['CIM_SoftwareIdentity'] != null && responses['CIM_SoftwareIdentity'].responses != null) {
                    amtlogicalelements = responses['CIM_SoftwareIdentity'].responses;
                    if (responses['AMT_SetupAndConfigurationService'] != null && responses['AMT_SetupAndConfigurationService'].response != null) amtlogicalelements.push(responses['AMT_SetupAndConfigurationService'].response);
                }
            }
            if (amtlogicalelements.length == 0) { disconnect(); return; }
            v = getInstance(amtlogicalelements, 'AMT')['VersionString'];
        } else {
            v = stack.wsman.comm.amtVersion;
            if (!v) { errcheck(400, stack); return; }
        }
        amtversion = parseInt(v.split('.')[0]);
        amtversionmin = parseInt(v.split('.')[1]);
        if (stack.wsman.comm.digestRealm && (currentcomputer['digestrealm'] != stack.wsman.comm.digestRealm)) {
            currentcomputer['digestrealm'] = stack.wsman.comm.digestRealm;
            saveComputers(); updateComputerDetails();
        }
        QV('id_versionWarning', checkAmtVersion(v));
        PullSystemStatus();
        updateSystemStatus();
        PullUserInfo();
        if (connectFunc) { connectFunc(connectFuncTag); connectFunc = null; connectFuncTag = null; }
        if (urlvars['kvm'] == 1) { go(14); connectDesktop(); }
        else if ((urlvars['kvmfull'] == 1) || (urlvars['kvmonly'] == 1)) { go(14); connectDesktop(); }
        else { go(1); }
    } else { errcheck(status, stack); }
}

function checkAmtVersion(version) {
    var vSplit = version.split('.'), v1 = parseInt(vSplit[0]), v2 = parseInt(vSplit[1]), v3 = parseInt(vSplit[2]), vx = v2 * 1000 + v3;
    if ((v1 <= 5) || (v1 >= 12)) return false;
    if ((v1 == 6) && (vx >= 2061)) return false;
    if ((v1 == 7) && (vx >= 1091)) return false;
    if ((v1 == 8) && (vx >= 1071)) return false;
    if ((v1 == 9)) { if ((v2 < 5) && (vx >= 1041)) return false; if (vx >= 5061) return false; }
    if ((v1 == 10) && (vx >= 55)) return false;
    if (v1 == 11) { if ((v2 < 5) && (vx >= 25)) return false; if (vx >= 6027) return false; }
    return true;
}

function PullUserInfo() {
    xxAccountFetch = 1;
    delete xxAccountAdminName;
    xxAccountRealmInfo = {};
    amtstack.AMT_AuthorizationService_GetAdminAclEntry(function(stack, name, response, status) {
        if (status != 200) return;
        xxAccountAdminName = response.Body['Username'];
    });
}

function PullPowerPolicy() { amtstack.Enum('AMT_SystemPowerScheme', function(stack, name, responses, status) { if (status == 200) AmtSystemPowerSchemes = responses; }); }

function PullHardware() {
    amtFirstPull |= 1;
    amtstack.BatchEnum('', ['CIM_ComputerSystemPackage'], function(stack, name, responses, status) {
        if (status == 200) HardwareInventory = responses;
    });
}

function PullSystemStatus(x) {
    refreshButtons(false);
    amtstack.AMT_TimeSynchronizationService_GetLowAccuracyTimeSynch(processSystemTime);
    var query = ['CIM_ServiceAvailableToElement', '*AMT_GeneralSettings', 'AMT_EthernetPortSettings', '*AMT_RedirectionService', 'CIM_ElementSettingData', '*AMT_BootCapabilities'];
    if (amtversion > 5) query.push('IPS_IPv6PortSettings', '*CIM_KVMRedirectionSAP', '*IPS_OptInService','*IPS_KVMRedirectionSettingData');
    if (amtversion > 9) query.push('*IPS_ScreenConfigurationService', '*IPS_PowerManagementService');
    if (amtversion > 15) query.push('*CIM_BootService');
    amtstack.BatchEnum('', query, processSystemStatus, true);
}

function processSystemTime(stack, name, responses, status) {
    if (errcheck(status, stack)) return;
    if (status == 200) { var t = new Date(), t2 = new Date(); t.setTime(responses.Body['Ta0'] * 1000); amtdeltatime = t - t2; updateSystemStatus(); }
}

function processSystemStatus(stack, name, responses, status) {
    if (wsstack == null || amtstack != stack) return;
    if ((responses['IPS_ScreenConfigurationService'] == undefined) || (responses['IPS_ScreenConfigurationService'].status == 400)) { responses['IPS_ScreenConfigurationService'] = null; }
    if ((responses['IPS_KVMRedirectionSettingData'] == undefined) || (responses['IPS_KVMRedirectionSettingData'].status == 400)) { responses['IPS_KVMRedirectionSettingData'] = null; }
    if ((responses['CIM_KVMRedirectionSAP'] == undefined) || (responses['CIM_KVMRedirectionSAP'].status == 400)) { responses['CIM_KVMRedirectionSAP'] = null; }
    if ((responses['IPS_OptInService'] == undefined) || (responses['IPS_OptInService'].status == 400)) { responses['IPS_OptInService'] = null; }
    status = 0;
    for (var i in responses) { if ((responses[i] != null) && (responses[i].status > status)) { status = responses[i].status; } }
    if ((status != 400) && errcheck(status, stack)) return;
    amtsysstate = responses;
    applyDesktopSettings();
    updateSystemStatus();
}

function PullPowerState() {
    if (amtstack && amtstack.GetPendingActions() == 0 && amtsysstate && amtsysstate['CIM_ServiceAvailableToElement']) {
        amtstack.Enum('CIM_ServiceAvailableToElement', function (stack, name, responses, status) {
            if (status != 200) return;
            amtsysstate['CIM_ServiceAvailableToElement'].responses = responses;
            if ((amtversion > 9) && amtsysstate['CIM_ServiceAvailableToElement'].responses.length > 0 && amtsysstate['CIM_ServiceAvailableToElement'].responses[0]['PowerState'] == 2) {
                amtstack.Get('IPS_PowerManagementService', function (stack, name, response, status) { if (status == 200) { amtsysstate['IPS_PowerManagementService'].response = response.Body; updateSystemStatus(); } });
            } else { updateSystemStatus(); }
        });
    }
}

function updateSystemStatus() {
    if ((!amtsysstate) || (currentView > 99)) return;
    var x = TableStart(), features = '', gs = amtsysstate['AMT_GeneralSettings'].response;
    var t = '<i>Unknown</i>';
    if (amtsysstate['CIM_ServiceAvailableToElement'] != null && amtsysstate['CIM_ServiceAvailableToElement'].responses != null && amtsysstate['CIM_ServiceAvailableToElement'].responses.length > 0) {
        t = DMTFPowerStates[amtsysstate['CIM_ServiceAvailableToElement'].responses[0]['PowerState']];
        if ((amtversion > 9) && (t == "Power on") && amtsysstate['IPS_PowerManagementService'] && amtsysstate['IPS_PowerManagementService'].response && amtsysstate['IPS_PowerManagementService'].response['OSPowerSavingState'] == 3) t = 'Standby (Connected)';
        QH('id_p14power', t);
    }
    if (gs['PowerSource']) t += [", Plugged-in", ", On Battery"][gs['PowerSource']];
    x += TableEntry("Power", addLink(t, 'showPowerActionDlg()'));
    var host = gs['HostName'];
    var y = gs['DomainName'];
    if (y != null && y.length > 0) host += '.' + y;
    if (host.length == 0) { host = '<i>None</i>'; } else { host = EscapeHtml(host); }
    x += TableEntry("Name & Domain", host);
    if (amtlogicalelements) {
        var scs = getItem(amtlogicalelements, 'CreationClassName', 'AMT_SetupAndConfigurationService');
        var mode = '';
        if (scs && scs['ProvisioningState'] == 2 && amtversion > 5) {
            mode = " activated in Admin Control Mode (ACM)";
            if (scs['ProvisioningMode'] == 4) mode = " activated in Client Control Mode (CCM)";
        }
        x += TableEntry("Intel&reg; ME", 'v' + getItem(amtlogicalelements, 'InstanceID', 'AMT')['VersionString'] + mode);
        currentcomputer['ver'] = getItem(amtlogicalelements, 'InstanceID', 'AMT')['VersionString'];
        currentcomputer['usbr'] = (parseInt(currentcomputer['ver']) >= 11);
        currentcomputer['date'] = new Date().toISOString();
        saveComputers();
    }
    var hostName = gs['HostName'];
    if (!hostName || hostName == '') { hostName = (currentcomputer && currentcomputer['name']) ? decodeURIComponent(currentcomputer['name']) : ((currentcomputer && currentcomputer['host']) ? decodeURIComponent(currentcomputer['host']) : ''); }
    QH('id_computername', format("Remote-AMT-KVM v{0}", version) + (hostName ? ' <span style="color:#8892b0;font-size:10pt;font-weight:400">&mdash; ' + EscapeHtml(hostName) + '</span>' : ''));
    if (amtsysstate['CIM_ServiceAvailableToElement'] != null && amtsysstate['CIM_ServiceAvailableToElement'].responses != null && amtsysstate['CIM_ServiceAvailableToElement'].responses.length > 0) {
        QV('id_p14warning2', amtsysstate['CIM_ServiceAvailableToElement'].responses[0]['PowerState'] != 2);
    }
    if (amtsysstate['AMT_RedirectionService'].status == 200) {
        var redir = amtfeatures[0] = (amtsysstate['AMT_RedirectionService'].response['ListenerEnabled'] == true);
        var sol = amtfeatures[1] = ((amtsysstate['AMT_RedirectionService'].response['EnabledState'] & 2) != 0);
        var ider = amtfeatures[2] = ((amtsysstate['AMT_RedirectionService'].response['EnabledState'] & 1) != 0);
        var kvm = amtfeatures[3] = undefined;
        if ((amtversion > 5) && (amtsysstate['CIM_KVMRedirectionSAP'] != null)) {
            QV('go14', true);
            kvm = amtfeatures[3] = ((amtsysstate['CIM_KVMRedirectionSAP'].response['EnabledState'] == 6 && amtsysstate['CIM_KVMRedirectionSAP'].response['RequestedState'] == 2) || amtsysstate['CIM_KVMRedirectionSAP'].response['EnabledState'] == 2 || amtsysstate['CIM_KVMRedirectionSAP'].response['EnabledState'] == 6);
        }
        if (redir) features += ", Redirection Port"; if (sol) features += ", Serial-over-LAN"; if (ider) features += (amtversion >= 11) ? ", USB-Redirect" : ", IDE-Redirect"; if (kvm) features += ", KVM";
        if (features == '') features = '  None';
        x += TableEntry("Active Features", addLinkConditional(features.substring(2), 'showFeaturesDlg()', xxAccountAdminName));
    }
    if (amtsysstate['IPS_KVMRedirectionSettingData'] != null && amtsysstate['IPS_KVMRedirectionSettingData'].response) {
        var ds = amtsysstate['IPS_KVMRedirectionSettingData'].response;
        features = "Primary display";
        if (ds['SessionTimeout']) features += ", " + ds['SessionTimeout'] + " minute session timeout";
        if ((amtversion > 9) && (amtsysstate['IPS_ScreenConfigurationService'] != null)) {
            var sb = ((amtsysstate['IPS_ScreenConfigurationService'].response['EnabledState'] & 1) != 0);
            QV('id_DeskSBspan', sb); Q('id_DeskSB').checked = false;
        } else { QV('id_DeskSBspan', false); }
        x += TableEntry("Remote Desktop", features);
    }
    QV('id_p14warning1', !redir || !kvm);
    QV('id_p14warninga', xxAccountAdminName);
    if ((amtversion > 5) && amtsysstate['IPS_OptInService'] != null && amtsysstate['IPS_OptInService'].response != undefined) {
        var optinrequired = amtsysstate['IPS_OptInService'].response['OptInRequired'];
        var consent = "Unknown";
        if (optinrequired == 0) consent = "Not Required";
        if (optinrequired == 1) consent = "Required for KVM only";
        if (optinrequired == 0xFFFFFFFF) consent = "Always Required";
        x += TableEntry("User Consent", consent);
    }
    if (amtdeltatime) { x += TableEntry("Date & Time", addLinkConditional(new Date(new Date().getTime() + amtdeltatime).toLocaleString(), 'syncClock()', xxAccountAdminName)); }
    var buttons = AddRefreshButton('PullSystemStatus()') + ' ' + AddButton("Power Actions...", 'showPowerActionDlg()');
    x += TableEnd(buttons);
    QH('id_TableSysStatus', x);
}

function syncClock() {
    if (xxdialogMode) return;
    setDialogMode(11, "Synchronize Clock", 3, function() {
        amtstack.AMT_TimeSynchronizationService_GetLowAccuracyTimeSynch(function (stack, name, response, status) {
            if (status != 200) { messagebox('', "Failed to set time, status = " + status); return; }
            var now = new Date(), Tm1 = Math.round(now.getTime() / 1000);
            amtstack.AMT_TimeSynchronizationService_SetHighAccuracyTimeSynch(response.Body['Ta0'], Tm1, Tm1, function () { amtstack.AMT_TimeSynchronizationService_GetLowAccuracyTimeSynch(processSystemTime); });
        });
    }, "Synchronize Intel AMT clock with this computer?");
}

// ========== FEATURES DIALOG ==========

function showFeaturesDlg() {
    if (xxdialogMode || !xxAccountAdminName) return;
    idx_d9redir.checked = amtfeatures[0]; idx_d9kvm.checked = amtfeatures[3]; idx_d9ider.checked = amtfeatures[2]; idx_d9sol.checked = amtfeatures[1];
    QV('idx_d9kvm_div', amtfeatures[3] != null);
    setDialogMode(9, "Intel&reg; AMT Features", 3, function() {
        var r = amtsysstate['AMT_RedirectionService'].response;
        r['ListenerEnabled'] = idx_d9redir.checked;
        r['EnabledState'] = 32768 + ((idx_d9ider.checked?1:0) + (idx_d9sol.checked?2:0));
        amtstack.AMT_RedirectionService_RequestStateChange(r['EnabledState'], function (stack, name, response, status) {
            if (status != 200) { messagebox("Error", "RequestStateChange Error " + status); return; }
            if (amtfeatures[3] != null) {
                amtstack.CIM_KVMRedirectionSAP_RequestStateChange((idx_d9kvm.checked) ? 2 : 3, 0, function (stack, name, response, status) {
                    if (status != 200) { messagebox("Error", "KVM RequestStateChange Error " + status); return; }
                    amtstack.Put('AMT_RedirectionService', r, function (stack, name, response, status) {
                        if (status != 200) { messagebox("Error", "PUT Error " + status); return; }
                        amtstack.Get('AMT_RedirectionService', function(s,n,r,st) { if (st==200) { amtsysstate['AMT_RedirectionService'].response = r.Body; updateSystemStatus(); } }, 0, 1);
                        amtstack.Get('CIM_KVMRedirectionSAP', function(s,n,r,st) { if (st==200) { amtsysstate['CIM_KVMRedirectionSAP'].response = r.Body; updateSystemStatus(); } }, 0, 1);
                    }, 0, 1);
                });
            }
        });
    });
}

// ========== POWER ACTIONS DIALOG ==========

function showPowerActionDlg() {
    if (xxdialogMode) return;
    var powerState = 3;
    try { var x = amtsysstate['CIM_ServiceAvailableToElement'].responses[0]['PowerState']; powerState = (x == 2) ? 1 : 2; } catch (ex) { }
    amtPowerBootCapabilities = amtsysstate['AMT_BootCapabilities'].response;
    QH('d5actionSelect', '');
    if (powerState & 2) addOption('d5actionSelect', "Power up", 2);
    if (powerState & 1) { addOption('d5actionSelect', "Reset", 10); addOption('d5actionSelect', "Power cycle", 5); addOption('d5actionSelect', "Power down", 8); }
    if ((amtversion > 9) && (powerState & 1)) { addOption('d5actionSelect', "Soft-off", 12); addOption('d5actionSelect', "Soft-reset", 14); }
    if (amtPowerBootCapabilities && amtPowerBootCapabilities['BIOSSetup'] == true) {
        if (powerState & 2) addOption('d5actionSelect', "Power up to BIOS", 100);
        if (powerState & 1) addOption('d5actionSelect', "Reset to BIOS", 101);
    }
    if (powerState & 1) addOption('d5actionSelect', "Reset to PXE", 400);
    if (powerState & 2) addOption('d5actionSelect', "Power on to PXE", 401);
    setDialogMode(5, "Power Actions", 3, powerActionDlgCheck);
}

function powerActionDlgCheck() {
    powerActionDlg();
}

function powerActionDlg() {
    var action = parseInt(d5actionSelect.value);
    statusbox("Power Actions", "Performing action...");
    if (action < 100) {
        amtstack.RequestPowerStateChange(action, function (stack, name, response, status) {
            if (status == 200) { QH('id_dialogMessage', "Power action completed."); } else { QH('id_dialogMessage', format("Power action error #{0}.", status)); }
            setDialogMode(1, "Power Action", 0);
            setTimeout(function () { setDialogMode(0); }, 1300);
        });
    } else if (action == 100 || action == 101) {
        // Boot to BIOS
        amtstack.SetBootConfigRole(1, function (stack, name, response, status) {
            var bootSource = 'CIM_BootSourceSetting', settings = amtsysstate['AMT_BootCapabilities'].response;
            amtstack.CIM_BootConfigSetting_ChangeBootOrder(null, function () {
                amtstack.Put('AMT_BootSettingData', { BIOSSetup: true }, function () {
                    amtstack.RequestPowerStateChange((action == 100)?2:10, function (stack, name, response, status) {
                        if (status == 200) QH('id_dialogMessage', "Power action completed."); else QH('id_dialogMessage', "Power action error.");
                        setDialogMode(1, "Power Action", 0); setTimeout(function () { setDialogMode(0); }, 1300);
                    });
                }, 0, 1);
            });
        });
    } else if (action == 400 || action == 401) {
        // Boot to PXE
        amtstack.SetBootConfigRole(1, function () {
            amtstack.CIM_BootConfigSetting_ChangeBootOrder('<Address xmlns="http://schemas.xmlsoap.org/ws/2004/08/addressing">http://schemas.xmlsoap.org/ws/2004/08/addressing</Address><ReferenceParameters xmlns="http://schemas.xmlsoap.org/ws/2004/08/addressing"><ResourceURI xmlns="http://schemas.dmtf.org/wbem/wsman/1/wsman.xsd">http://schemas.dmtf.org/wbem/wscim/1/cim-schema/2/CIM_BootSourceSetting</ResourceURI><SelectorSet xmlns="http://schemas.dmtf.org/wbem/wsman/1/wsman.xsd"><Selector Name="InstanceID">Intel(r) AMT: Force PXE Boot</Selector></SelectorSet></ReferenceParameters>', function () {
                amtstack.Put('AMT_BootSettingData', {}, function () {
                    amtstack.RequestPowerStateChange((action == 400)?10:2, function (stack, name, response, status) {
                        if (status == 200) QH('id_dialogMessage', "Power action completed."); else QH('id_dialogMessage', "Power action error.");
                        setDialogMode(1, "Power Action", 0); setTimeout(function () { setDialogMode(0); }, 1300);
                    });
                }, 0, 1);
            });
        });
    }
}

package com.velorachat.app;

import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "DeviceIdentity")
public class DeviceIdentityPlugin extends Plugin {
    @PluginMethod
    public void getId(PluginCall call) {
        String identifier = Settings.Secure.getString(
            getContext().getContentResolver(),
            Settings.Secure.ANDROID_ID
        );
        if (identifier == null || identifier.trim().length() < 16) {
            call.reject("A stable app device identifier is unavailable.");
            return;
        }
        JSObject result = new JSObject();
        result.put("identifier", identifier.trim());
        call.resolve(result);
    }
}

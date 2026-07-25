package com.velorachat.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import me.leolin.shortcutbadger.ShortcutBadger;

@CapacitorPlugin(name = "AppBadge")
public class AppBadgePlugin extends Plugin {
    @PluginMethod
    public void setCount(PluginCall call) {
        Integer count = call.getInt("count");
        if (count == null) {
            call.reject("count is required.");
            return;
        }

        int normalizedCount = Math.max(count, 0);
        boolean applied = ShortcutBadger.applyCount(getContext(), normalizedCount);

        JSObject result = new JSObject();
        result.put("ok", true);
        result.put("count", normalizedCount);
        result.put("supported", applied);
        call.resolve(result);
    }

    @PluginMethod
    public void clear(PluginCall call) {
        ShortcutBadger.removeCount(getContext());

        JSObject result = new JSObject();
        result.put("ok", true);
        result.put("count", 0);
        call.resolve(result);
    }

    @PluginMethod
    public void isSupported(PluginCall call) {
        JSObject result = new JSObject();
        result.put("supported", ShortcutBadger.isBadgeCounterSupported(getContext()));
        call.resolve(result);
    }
}

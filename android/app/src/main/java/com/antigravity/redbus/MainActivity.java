package com.antigravity.redbus;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.wearable.PutDataMapRequest;
import com.google.android.gms.wearable.PutDataRequest;
import com.google.android.gms.wearable.Wearable;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WearSyncPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @CapacitorPlugin(name = "WearSync")
    public static class WearSyncPlugin extends Plugin {
        @PluginMethod
        public void syncState(PluginCall call) {
            String data = call.getString("data");
            if (data == null) {
                call.reject("Must provide data string");
                return;
            }

            try {
                PutDataMapRequest dataMap = PutDataMapRequest.create("/shared_state");
                dataMap.getDataMap().putString("json", data);
                dataMap.getDataMap().putLong("timestamp", System.currentTimeMillis());
                PutDataRequest request = dataMap.asPutDataRequest();
                request.setUrgent();

                Wearable.getDataClient(getContext()).putDataItem(request)
                    .addOnSuccessListener(dataItem -> {
                        JSObject ret = new JSObject();
                        ret.put("status", "success");
                        call.resolve(ret);
                    })
                    .addOnFailureListener(e -> call.reject("Failed to sync: " + e.getMessage()));
            } catch (Exception e) {
                call.reject("Error preparing sync: " + e.getMessage());
            }
        }
    }
}

package com.mpd.redbus.wear;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.os.Bundle;
import android.webkit.GeolocationPermissions;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import com.google.android.gms.wearable.DataClient;
import com.google.android.gms.wearable.DataEvent;
import com.google.android.gms.wearable.DataEventBuffer;
import com.google.android.gms.wearable.DataItem;
import com.google.android.gms.wearable.DataMap;
import com.google.android.gms.wearable.DataMapItem;
import com.google.android.gms.wearable.DataMapItem;
import com.google.android.gms.wearable.Wearable;
import android.util.Log;


public class MainActivity extends Activity implements DataClient.OnDataChangedListener {

    private WebView webView;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.KITKAT) {
            WebView.setWebContentsDebuggingEnabled(true);
        }
        
        setContentView(R.layout.activity_main);
        webView = findViewById(R.id.webView);


        WebSettings webSettings = webView.getSettings();
        webSettings.setJavaScriptEnabled(true);
        webSettings.setDomStorageEnabled(true);
        webSettings.setAllowFileAccess(true);
        webSettings.setAllowContentAccess(true);
        webSettings.setDatabaseEnabled(true);
        webSettings.setGeolocationEnabled(true);

        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                callback.invoke(origin, true, false);
            }
        });

        webView.loadUrl("file:///android_asset/wear.html");
    }

    @Override
    protected void onResume() {
        super.onResume();
        try {
            Wearable.getDataClient(this).addListener(this);
        } catch (Exception e) {
            Log.e("WearBus", "Failed to add DataClient listener", e);
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        try {
            Wearable.getDataClient(this).removeListener(this);
        } catch (Exception e) {
            Log.e("WearBus", "Failed to remove DataClient listener", e);
        }
    }


    @Override
    public void onDataChanged(DataEventBuffer dataEvents) {
        for (DataEvent event : dataEvents) {
            if (event.getType() == DataEvent.TYPE_CHANGED) {
                DataItem item = event.getDataItem();
                if (item.getUri().getPath().compareTo("/shared_state") == 0) {
                    DataMap dataMap = DataMapItem.fromDataItem(item).getDataMap();
                    String json = dataMap.getString("json");
                    if (json != null) {
                        final String finalJson = json;
                        runOnUiThread(() -> {
                            // Inject into localStorage and call the update handler
                            webView.evaluateJavascript(
                                "localStorage.setItem('shared_bus_radar_state', '" + finalJson.replace("'", "\\'") + "'); " +
                                "if(window.updateFromPhone) { window.updateFromPhone(" + finalJson + "); }", 
                                null
                            );
                        });
                    }
                }
            }
        }
    }
}

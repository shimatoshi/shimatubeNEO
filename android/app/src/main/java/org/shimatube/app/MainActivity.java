package org.shimatube.app;

import android.app.Activity;
import android.app.DownloadManager;
import android.app.PictureInPictureParams;
import android.content.Intent;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;
import android.util.Rational;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.URLUtil;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.TextView;
import android.widget.Toast;

public class MainActivity extends Activity {

    private static final String TAG = "ShimaTube";
    private static final int PORT = 8080;
    private WebView webView;
    private TextView loadingText;
    private FrameLayout fullscreenContainer;
    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webview);
        loadingText = findViewById(R.id.loading_text);
        fullscreenContainer = findViewById(R.id.fullscreen_container);

        setupWebView();
        ensureStoragePermission();

        // Foreground Serviceを起動
        Intent serviceIntent = new Intent(this, ServerService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(serviceIntent);
        } else {
            startService(serviceIntent);
        }

        // サーバー起動を待ってWebViewに表示
        new Thread(() -> {
            waitForServer();
            new Handler(Looper.getMainLooper()).post(() -> {
                loadingText.setVisibility(View.GONE);
                webView.loadUrl("http://127.0.0.1:" + PORT);
            });
        }).start();
    }

    private void setupWebView() {
        WebView.setWebContentsDebuggingEnabled(true);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setAllowFileAccess(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);

        // WebViewはWeb PiP APIを公開しないので、JSからネイティブPiPを呼べるブリッジを渡す
        webView.addJavascriptInterface(new PiPBridge(), "AndroidPiP");

        webView.setWebViewClient(new WebViewClient());

        // フルスクリーン対応WebChromeClient
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (customView != null) {
                    callback.onCustomViewHidden();
                    return;
                }
                customView = view;
                customViewCallback = callback;
                fullscreenContainer.addView(view, new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT));
                fullscreenContainer.setVisibility(View.VISIBLE);
                webView.setVisibility(View.GONE);
                getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
            }

            @Override
            public void onHideCustomView() {
                if (customView == null) return;
                fullscreenContainer.removeView(customView);
                fullscreenContainer.setVisibility(View.GONE);
                webView.setVisibility(View.VISIBLE);
                customViewCallback.onCustomViewHidden();
                customView = null;
                customViewCallback = null;
                getWindow().clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
            }
        });

        // ダウンロード対応
        webView.setDownloadListener((url, userAgent, contentDisposition, mimetype, contentLength) -> {
            try {
                DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                String filename = URLUtil.guessFileName(url, contentDisposition, mimetype);
                request.setTitle(filename);
                request.setDescription("ShimaTube NEO Download");
                request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, filename);

                String cookies = CookieManager.getInstance().getCookie(url);
                if (cookies != null) {
                    request.addRequestHeader("Cookie", cookies);
                }
                request.addRequestHeader("User-Agent", userAgent);

                DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
                dm.enqueue(request);
                Toast.makeText(this, "Download: " + filename, Toast.LENGTH_SHORT).show();
            } catch (Exception e) {
                Log.e(TAG, "Download failed", e);
                Toast.makeText(this, "Download failed: " + e.getMessage(), Toast.LENGTH_SHORT).show();
            }
        });
    }

    /** WebView内JSからネイティブPiPを呼ぶためのブリッジ (window.AndroidPiP) */
    public class PiPBridge {
        @JavascriptInterface
        public void enterPiP() {
            runOnUiThread(MainActivity.this::enterPiP);
        }

        @JavascriptInterface
        public boolean isSupported() {
            return Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                    && getPackageManager().hasSystemFeature(
                            android.content.pm.PackageManager.FEATURE_PICTURE_IN_PICTURE);
        }
    }

    /** PiP対応 */
    public void enterPiP() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            PictureInPictureParams params = new PictureInPictureParams.Builder()
                    .setAspectRatio(new Rational(16, 9))
                    .build();
            enterPictureInPictureMode(params);
        }
    }

    @Override
    public void onUserLeaveHint() {
        super.onUserLeaveHint();
        // ホームボタン押下時に動画再生中ならPiPに入る
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            webView.evaluateJavascript(
                "(function() { var v = document.querySelector('video'); return v && !v.paused ? 'playing' : 'idle'; })()",
                value -> {
                    if ("\"playing\"".equals(value)) {
                        enterPiP();
                    }
                }
            );
        }
    }

    @Override
    public void onPictureInPictureModeChanged(boolean isInPiP, Configuration newConfig) {
        super.onPictureInPictureModeChanged(isInPiP, newConfig);
        // PiPモード時はUIを非表示にして動画だけ見せる
        if (isInPiP) {
            loadingText.setVisibility(View.GONE);
        }
    }

    private void ensureStoragePermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            if (!Environment.isExternalStorageManager()) {
                try {
                    Intent intent = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION);
                    intent.setData(Uri.parse("package:" + getPackageName()));
                    startActivity(intent);
                } catch (Exception e) {
                    Intent intent = new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION);
                    startActivity(intent);
                }
            }
        }
    }

    private void waitForServer() {
        for (int i = 0; i < 120; i++) {
            try {
                java.net.URL url = new java.net.URL("http://127.0.0.1:" + PORT + "/api/version");
                java.net.HttpURLConnection conn = (java.net.HttpURLConnection) url.openConnection();
                conn.setConnectTimeout(500);
                conn.setReadTimeout(500);
                int code = conn.getResponseCode();
                conn.disconnect();
                if (code == 200) return;
            } catch (Exception ignored) {}
            try { Thread.sleep(500); } catch (InterruptedException ignored) {}
        }
    }

    @Override
    public void onBackPressed() {
        // フルスクリーン中はまずそれを閉じる
        if (customView != null) {
            webView.getWebChromeClient();
            customViewCallback.onCustomViewHidden();
            fullscreenContainer.removeView(customView);
            fullscreenContainer.setVisibility(View.GONE);
            webView.setVisibility(View.VISIBLE);
            customView = null;
            customViewCallback = null;
            getWindow().clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
            return;
        }

        webView.evaluateJavascript(
            "if(window.history.length > 1) { window.history.back(); 'ok'; } else { 'exit'; }",
            value -> {
                if (!"\"ok\"".equals(value)) {
                    runOnUiThread(() -> super.onBackPressed());
                }
            }
        );
    }
}

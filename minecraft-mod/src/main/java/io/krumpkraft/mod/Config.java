package io.krumpkraft.mod;

import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.plugin.java.JavaPlugin;

public class Config {

    private final JavaPlugin plugin;
    private String apiUrl;
    private int timeoutMs;
    private int syncIntervalMs;
    private boolean markersEnabled;
    private String spawnWorld;
    private int defaultY;
    private boolean showRole;

    public Config(JavaPlugin plugin) {
        this.plugin = plugin;
        reload();
    }

    public void reload() {
        plugin.reloadConfig();
        FileConfiguration c = plugin.getConfig();
        apiUrl = c.getString("api.url", "http://localhost:8081").replaceAll("/+$", "");
        timeoutMs = c.getInt("api.timeout-ms", 60000);
        syncIntervalMs = Math.max(2000, c.getInt("api.sync-interval-ms", 5000));
        markersEnabled = c.getBoolean("markers.enabled", true);
        spawnWorld = c.getString("markers.spawn-world", "world");
        defaultY = c.getInt("markers.default-y", 64);
        showRole = c.getBoolean("markers.show-role", true);
    }

    public String getApiUrl() { return apiUrl; }
    public int getTimeoutMs() { return timeoutMs; }
    public int getSyncIntervalMs() { return syncIntervalMs; }
    public boolean isMarkersEnabled() { return markersEnabled; }
    public String getSpawnWorld() { return spawnWorld; }
    public int getDefaultY() { return defaultY; }
    public boolean isShowRole() { return showRole; }
}

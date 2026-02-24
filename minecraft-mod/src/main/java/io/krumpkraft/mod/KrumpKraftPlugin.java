package io.krumpkraft.mod;

import org.bukkit.plugin.java.JavaPlugin;

public final class KrumpKraftPlugin extends JavaPlugin {

    private Config config;
    private ApiClient apiClient;
    private AgentMarkerTask markerTask;

    @Override
    public void onEnable() {
        saveDefaultConfig();
        config = new Config(this);
        apiClient = new ApiClient(config);
        getServer().getPluginManager().registerEvents(new KrumpChatListener(this), this);
        if (config.isMarkersEnabled()) {
            markerTask = new AgentMarkerTask(this);
            markerTask.start();
        }
        getLogger().info("KrumpKraftMod enabled. API: " + config.getApiUrl());
    }

    @Override
    public void onDisable() {
        if (markerTask != null) {
            markerTask.cancel();
        }
    }

    public Config getPluginConfig() {
        return config;
    }

    public ApiClient getApiClient() {
        return apiClient;
    }
}

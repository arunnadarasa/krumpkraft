package io.krumpkraft.mod;

import io.papermc.paper.threadedregions.scheduler.ScheduledTask;
import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.World;
import org.bukkit.entity.ArmorStand;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

public class AgentMarkerTask {

    private final KrumpKraftPlugin plugin;
    private final Map<String, UUID> agentIdToStand = new HashMap<>();
    private ScheduledTask task;

    public AgentMarkerTask(KrumpKraftPlugin plugin) {
        this.plugin = plugin;
    }

    public void start() {
        long intervalMs = Math.max(2000, plugin.getPluginConfig().getSyncIntervalMs());
        task = Bukkit.getAsyncScheduler().runAtFixedRate(plugin, (t) -> pollAndSync(), 3000, intervalMs, TimeUnit.MILLISECONDS);
    }

    public void cancel() {
        if (task != null) {
            task.cancel();
            task = null;
        }
        Bukkit.getGlobalRegionScheduler().run(plugin, (t) -> removeAllStands());
    }

    private void pollAndSync() {
        List<ApiClient.AgentInfo> agents = plugin.getApiClient().fetchAgents();
        plugin.getServer().getGlobalRegionScheduler().run(plugin, (t) -> syncMarkers(agents));
    }

    private void syncMarkers(List<ApiClient.AgentInfo> agents) {
        Config cfg = plugin.getPluginConfig();
        if (!cfg.isMarkersEnabled()) {
            removeAllStands();
            return;
        }
        World world = Bukkit.getWorld(cfg.getSpawnWorld());
        if (world == null) return;

        Map<String, ApiClient.AgentInfo> byId = new HashMap<>();
        for (ApiClient.AgentInfo a : agents) byId.put(a.id, a);

        for (Map.Entry<String, UUID> e : new HashMap<>(agentIdToStand).entrySet()) {
            String id = e.getKey();
            if (!byId.containsKey(id)) {
                ArmorStand stand = findStand(e.getValue());
                if (stand != null) stand.remove();
                agentIdToStand.remove(id);
            }
        }

        for (ApiClient.AgentInfo a : agents) {
            Location loc = new Location(world, a.x + 0.5, a.y, a.z + 0.5);
            String name = cfg.isShowRole() ? (a.name + " (" + a.role + ")") : a.name;
            UUID existing = agentIdToStand.get(a.id);
            ArmorStand stand = findStand(existing);
            if (stand == null) {
                stand = world.spawn(loc, ArmorStand.class, as -> {
                    as.setCustomNameVisible(true);
                    as.setCustomName(name);
                    as.setGravity(false);
                    as.setInvulnerable(true);
                    as.setMarker(true);
                    as.setSmall(true);
                });
                agentIdToStand.put(a.id, stand.getUniqueId());
            } else {
                stand.teleport(loc);
                stand.setCustomName(name);
            }
        }
    }

    private ArmorStand findStand(UUID uuid) {
        if (uuid == null) return null;
        for (World w : Bukkit.getWorlds()) {
            try {
                var e = Bukkit.getEntity(uuid);
                if (e instanceof ArmorStand) return (ArmorStand) e;
            } catch (Exception ignored) {}
        }
        return null;
    }

    private void removeAllStands() {
        for (UUID u : agentIdToStand.values()) {
            ArmorStand s = findStand(u);
            if (s != null) s.remove();
        }
        agentIdToStand.clear();
    }
}

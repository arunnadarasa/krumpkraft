package io.krumpkraft.mod;

import io.papermc.paper.event.player.AsyncChatEvent;
import net.kyori.adventure.text.serializer.plain.PlainTextComponentSerializer;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;

public class KrumpChatListener implements Listener {

    private final KrumpKraftPlugin plugin;

    public KrumpChatListener(KrumpKraftPlugin plugin) {
        this.plugin = plugin;
    }

    @EventHandler(priority = EventPriority.NORMAL, ignoreCancelled = false)
    public void onChat(AsyncChatEvent event) {
        String raw = PlainTextComponentSerializer.plainText().serialize(event.message());
        String message = raw == null ? "" : raw.trim();
        if (!message.startsWith("!")) return;

        event.setCancelled(true);
        Player player = event.getPlayer();
        String playerName = player.getName();

        plugin.getServer().getAsyncScheduler().runNow(plugin, (t) -> {
            ApiClient.ChatResponse response = plugin.getApiClient().sendChat(playerName, message);
            plugin.getServer().getGlobalRegionScheduler().run(plugin, (t2) -> {
                if (response.replies != null && response.replies.length > 0) {
                    for (String line : response.replies) {
                        player.sendMessage("[KrumpKraft] " + line);
                    }
                } else if (response.reply != null) {
                    player.sendMessage("[KrumpKraft] " + response.reply);
                }
            });
        });
    }
}

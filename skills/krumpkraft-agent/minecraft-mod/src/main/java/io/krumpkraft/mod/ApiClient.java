package io.krumpkraft.mod;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

public class ApiClient {

    private final Config config;
    private final HttpClient http;

    public ApiClient(Config config) {
        this.config = config;
        this.http = HttpClient.newBuilder()
                .connectTimeout(Duration.ofMillis(config.getTimeoutMs()))
                .build();
    }

    public static class AgentInfo {
        public String id;
        public String name;
        public String role;
        public String state;
        public int x;
        public int y;
        public int z;
    }

    public List<AgentInfo> fetchAgents() {
        String url = config.getApiUrl() + "/api/v1/bluemap/agents";
        try {
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .GET()
                    .timeout(Duration.ofMillis(config.getTimeoutMs()))
                    .build();
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() != 200) return new ArrayList<>();
            JsonObject root = JsonParser.parseString(res.body()).getAsJsonObject();
            JsonArray arr = root.has("agents") ? root.getAsJsonArray("agents") : new JsonArray();
            List<AgentInfo> list = new ArrayList<>();
            for (int i = 0; i < arr.size(); i++) {
                JsonObject o = arr.get(i).getAsJsonObject();
                AgentInfo a = new AgentInfo();
                a.id = o.has("id") ? o.get("id").getAsString() : "";
                a.name = o.has("name") ? o.get("name").getAsString() : a.id;
                a.role = o.has("role") ? o.get("role").getAsString() : "";
                a.state = o.has("state") ? o.get("state").getAsString() : "";
                a.x = o.has("x") ? o.get("x").getAsInt() : 0;
                a.y = o.has("y") ? o.get("y").getAsInt() : config.getDefaultY();
                a.z = o.has("z") ? o.get("z").getAsInt() : 0;
                list.add(a);
            }
            return list;
        } catch (Exception e) {
            return new ArrayList<>();
        }
    }

    public static class ChatResponse {
        public String reply;
        public String[] replies;
    }

    public ChatResponse sendChat(String playerName, String message) {
        String url = config.getApiUrl() + "/minecraft/chat";
        try {
            JsonObject body = new JsonObject();
            body.addProperty("player", playerName);
            body.addProperty("message", message);
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(body.toString()))
                    .timeout(Duration.ofMillis(config.getTimeoutMs()))
                    .build();
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() != 200) {
                ChatResponse r = new ChatResponse();
                r.reply = "API error: " + res.statusCode();
                return r;
            }
            JsonObject root = JsonParser.parseString(res.body()).getAsJsonObject();
            ChatResponse r = new ChatResponse();
            if (root.has("replies")) {
                JsonArray arr = root.getAsJsonArray("replies");
                r.replies = new String[arr.size()];
                for (int i = 0; i < arr.size(); i++) r.replies[i] = arr.get(i).getAsString();
                if (r.replies.length > 0) r.reply = r.replies[0];
            } else {
                r.reply = root.has("reply") ? root.get("reply").getAsString() : "No reply.";
            }
            return r;
        } catch (Exception e) {
            ChatResponse r = new ChatResponse();
            r.reply = "Error: " + e.getMessage();
            return r;
        }
    }
}

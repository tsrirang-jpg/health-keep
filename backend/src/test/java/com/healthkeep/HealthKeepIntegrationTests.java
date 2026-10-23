package com.healthkeep;

import static org.junit.jupiter.api.Assertions.*;
import java.net.URI;
import java.net.http.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT)
class HealthKeepIntegrationTests {
    @LocalServerPort int port;
    final HttpClient client=HttpClient.newHttpClient();
    final JsonMapper json=JsonMapper.builder().build();
    record Account(String email,String token,String refresh,String id) {}
    JsonNode call(String method,String path,String token,Object body,int expected,String... match) throws Exception {
        var request=HttpRequest.newBuilder(URI.create("http://localhost:"+port+"/api/v1"+path))
            .header("Content-Type","application/json");
        if(token!=null)request.header("Authorization","Bearer "+token);
        if(match.length>0)request.header("If-Match",match[0]);
        request.method(method,body==null?HttpRequest.BodyPublishers.noBody():HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body)));
        var response=client.send(request.build(),HttpResponse.BodyHandlers.ofString());
        assertEquals(expected,response.statusCode(),method+" "+path);
        return response.body().isBlank()?json.createObjectNode():json.readTree(response.body());
    }
    Account register() throws Exception {
        String email="synthetic-"+UUID.randomUUID()+"@example.test";
        var result=call("POST","/auth/register",null,Map.of("email",email,"password","Synthetic-Password-2026","displayName","Synthetic user"),201);
        return new Account(email,result.path("accessToken").asText(),result.path("refreshToken").asText(),result.path("user").path("id").asText());
    }
    String patient(Account a) throws Exception {
        return call("POST","/patients",a.token(),Map.of("displayName","Synthetic patient","bloodGroup","UNKNOWN"),201).path("patient").path("id").asText();
    }
    Map<String,Object> note(String title){return Map.of("kind","NOTE","title",title,"details","Synthetic test data","provider","");}
    @Test void browserPreflightAllowsOnlyConfiguredOrigin() throws Exception {
        for (String origin:List.of("http://localhost:8081","http://untrusted.example.test")) {
            var request=HttpRequest.newBuilder(URI.create("http://localhost:"+port+"/api/v1/auth/register"))
                .method("OPTIONS",HttpRequest.BodyPublishers.noBody()).header("Origin",origin)
                .header("Access-Control-Request-Method","POST")
                .header("Access-Control-Request-Headers","content-type,authorization").build();
            var response=client.send(request,HttpResponse.BodyHandlers.ofString());
            if (origin.equals("http://localhost:8081")) {
                assertEquals(200,response.statusCode());
                assertEquals(origin,response.headers().firstValue("Access-Control-Allow-Origin").orElse(""));
            } else {
                assertEquals(403,response.statusCode());
                assertTrue(response.headers().firstValue("Access-Control-Allow-Origin").isEmpty());
            }
        }
    }
    @Test void authenticationRotationAndRevocation() throws Exception {
        call("GET","/patients",null,null,401);
        call("POST","/auth/register",null,Map.of("email","invalid","password","short","displayName",""),400);
        var a=register();
        call("POST","/auth/login",null,Map.of("email",a.email(),"password","wrong-password"),401);
        var login=call("POST","/auth/login",null,Map.of("email",a.email(),"password","Synthetic-Password-2026"),200);
        call("GET","/auth/me",login.path("accessToken").asText(),null,200);
        var next=call("POST","/auth/refresh",null,Map.of("refreshToken",a.refresh()),200);
        call("POST","/auth/refresh",null,Map.of("refreshToken",a.refresh()),401);
        call("POST","/auth/logout",next.path("accessToken").asText(),null,204);
        call("GET","/patients",a.token(),null,401);
        call("POST","/auth/refresh",null,Map.of("refreshToken",next.path("refreshToken").asText()),401);
    }
    @Test void unrelatedAccountsCannotReadWriteShareOrSync() throws Exception {
        var owner=register();var stranger=register();String id=patient(owner);
        assertEquals(0,call("GET","/patients",stranger.token(),null,200).size());
        for(String suffix:List.of("","/records","/members","/sync"))call("GET","/patients/"+id+suffix,stranger.token(),null,404);
        call("POST","/patients/"+id+"/records",stranger.token(),note("Blocked"),404);
        call("POST","/patients/"+id+"/members",stranger.token(),Map.of("email",stranger.email(),"role","EDITOR"),404);
        call("PUT","/patients/"+id,stranger.token(),Map.of("displayName","Blocked","bloodGroup","A+","version",1),404);
    }
    @Test void viewerEditorAndOwnerRightsAndRevocation() throws Exception {
        var owner=register();var viewer=register();var editor=register();String id=patient(owner),base="/patients/"+id;
        call("POST",base+"/members",owner.token(),Map.of("email",viewer.email(),"role","VIEWER"),204);
        call("POST",base+"/members",owner.token(),Map.of("email",editor.email(),"role","EDITOR"),204);
        call("GET",base+"/sync",viewer.token(),null,200);
        call("POST",base+"/records",viewer.token(),note("Blocked"),403);
        call("PUT",base,viewer.token(),Map.of("displayName","Blocked","bloodGroup","A+","version",1),403);
        call("GET",base+"/members",editor.token(),null,403);
        call("POST",base+"/members",editor.token(),Map.of("email",viewer.email(),"role","EDITOR"),403);
        var record=call("POST",base+"/records",editor.token(),note("Allowed"),201);
        var body=new HashMap<>(note("Updated"));body.put("version",1);
        call("PUT",base+"/records/"+record.path("id").asText(),editor.token(),body,200);
        call("DELETE",base+"/records/"+record.path("id").asText(),viewer.token(),null,403,"2");
        call("POST",base+"/members",owner.token(),Map.of("email",owner.email(),"role","VIEWER"),400);
        call("POST",base+"/members",owner.token(),Map.of("email",editor.email(),"role","OWNER"),400);
        call("DELETE",base+"/members/"+owner.id(),owner.token(),null,400);
        call("DELETE",base+"/members/"+viewer.id(),owner.token(),null,204);
        call("GET",base+"/sync",viewer.token(),null,404);
        call("GET",base+"/records",viewer.token(),null,404);
    }
    @Test void optimisticVersionsAndRecordPathIsolation() throws Exception {
        var a=register();String first=patient(a),second=patient(a),base="/patients/"+first;
        call("PUT",base,a.token(),Map.of("displayName","Changed","bloodGroup","O+","version",1),200);
        call("PUT",base,a.token(),Map.of("displayName","Stale","bloodGroup","B+","version",1),409);
        call("PUT",base,a.token(),Map.of("displayName","Missing version","bloodGroup","B+"),400);
        var record=call("POST",base+"/records",a.token(),note("Initial"),201);String rid=record.path("id").asText();
        call("GET","/patients/"+second+"/records/"+rid,a.token(),null,404);
        var update=new HashMap<>(note("Updated"));update.put("version",1);
        call("PUT",base+"/records/"+rid,a.token(),update,200);
        call("PUT",base+"/records/"+rid,a.token(),update,409);
        call("DELETE",base+"/records/"+rid,a.token(),null,409,"1");
        call("DELETE",base+"/records/"+rid,a.token(),null,204,"2");
        call("GET",base+"/records/"+rid,a.token(),null,404);
    }
    @Test void syncPaginationCursorAndDeletionTombstone() throws Exception {
        var a=register();String id=patient(a),base="/patients/"+id;
        var record=call("POST",base+"/records",a.token(),note("Delete me"),201);
        call("DELETE",base+"/records/"+record.path("id").asText(),a.token(),null,204,"1");
        for(int n=0;n<100;n++)call("POST",base+"/records",a.token(),note("Synthetic "+n),201);
        var page=call("GET",base+"/sync?cursor=0",a.token(),null,200);
        assertEquals(100,page.path("events").size());assertTrue(page.path("hasMore").asBoolean());
        assertEquals("record.deleted",page.path("events").get(2).path("type").asText());
        assertFalse(page.path("events").get(2).path("payload").path("deletedAt").isNull());
        var last=call("GET",base+"/sync?cursor="+page.path("cursor").asLong(),a.token(),null,200);
        assertEquals(3,last.path("events").size());assertFalse(last.path("hasMore").asBoolean());
        assertEquals(103,last.path("cursor").asLong());
        assertEquals(0,call("GET",base+"/sync?cursor=103",a.token(),null,200).path("events").size());
        call("GET",base+"/sync?cursor=104",a.token(),null,400);
        call("GET",base+"/sync?cursor=-1",a.token(),null,400);
    }
    @Test void validatesAppointmentAndPatientFields() throws Exception {
        var a=register();String id=patient(a);
        call("POST","/patients",a.token(),Map.of("displayName","Invalid","bloodGroup","X"),400);
        call("POST","/patients",a.token(),Map.of("displayName","Future","bloodGroup","UNKNOWN","birthDate","2999-01-01"),400);
        call("POST","/patients/"+id+"/records",a.token(),Map.of("kind","APPOINTMENT","title","Missing date","details","","provider",""),400);
        call("POST","/patients/"+id+"/records",a.token(),Map.of("kind","APPOINTMENT","title","Synthetic appointment","details","","provider","Fictional hospital","occurredAt","2026-12-01T09:30:00+07:00"),201);
    }
}

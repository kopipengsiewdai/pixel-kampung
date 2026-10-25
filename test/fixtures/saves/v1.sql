-- Pixel Kampung save fixture: schema v1.
-- Fake data only: a tiny seeded test town (fake brains, made-up memories), never a real save.
-- Frozen: never edit. Made by `npm run save-fixture`; see docs/design/upgrades.md.
-- Saved as a town from before the cast's starting ties: nobody knows family yet, except Ah Seng, who met his father in play.
CREATE TABLE events (
        seq INTEGER PRIMARY KEY,
        t INTEGER NOT NULL,
        type TEXT NOT NULL,
        data TEXT NOT NULL
      );
CREATE TABLE ledger (
        seq INTEGER PRIMARY KEY,
        t INTEGER NOT NULL,
        from_id TEXT NOT NULL,
        to_id TEXT NOT NULL,
        cents INTEGER NOT NULL,
        reason TEXT NOT NULL
      );
CREATE TABLE memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        resident TEXT NOT NULL,
        t INTEGER NOT NULL,
        kind TEXT NOT NULL,
        text TEXT NOT NULL,
        importance INTEGER NOT NULL
      );
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE snapshot (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        t INTEGER NOT NULL,
        world TEXT NOT NULL,
        brains TEXT NOT NULL
      );
CREATE INDEX memories_by_resident ON memories (resident, t);
INSERT INTO "events" VALUES (1, 29892840, 'morning', '{"seq":1,"t":29892840,"type":"morning"}');
INSERT INTO "events" VALUES (2, 29892840, 'found_place', '{"seq":2,"t":29892840,"type":"found_place","who":"mdm-tan","place":"kopitiam"}');
INSERT INTO "events" VALUES (3, 29892840, 'found_place', '{"seq":3,"t":29892840,"type":"found_place","who":"mdm-tan","place":"notice-board"}');
INSERT INTO "events" VALUES (4, 29892840, 'found_place', '{"seq":4,"t":29892840,"type":"found_place","who":"rahim","place":"kopitiam"}');
INSERT INTO "events" VALUES (5, 29892840, 'found_place', '{"seq":5,"t":29892840,"type":"found_place","who":"rahim","place":"notice-board"}');
INSERT INTO "events" VALUES (6, 29892840, 'found_place', '{"seq":6,"t":29892840,"type":"found_place","who":"rahim","place":"provision-shop"}');
INSERT INTO "events" VALUES (7, 29892840, 'found_place', '{"seq":7,"t":29892840,"type":"found_place","who":"mei-ling","place":"kopitiam"}');
INSERT INTO "events" VALUES (8, 29892840, 'found_place', '{"seq":8,"t":29892840,"type":"found_place","who":"mei-ling","place":"notice-board"}');
INSERT INTO "events" VALUES (9, 29892840, 'found_place', '{"seq":9,"t":29892840,"type":"found_place","who":"mei-ling","place":"provision-shop"}');
INSERT INTO "events" VALUES (10, 29892840, 'found_place', '{"seq":10,"t":29892840,"type":"found_place","who":"ah-kow","place":"notice-board"}');
INSERT INTO "events" VALUES (11, 29892840, 'found_place', '{"seq":11,"t":29892840,"type":"found_place","who":"ah-kow","place":"provision-shop"}');
INSERT INTO "events" VALUES (12, 29892840, 'found_place', '{"seq":12,"t":29892840,"type":"found_place","who":"ah-kow","place":"well"}');
INSERT INTO "events" VALUES (13, 29892840, 'found_place', '{"seq":13,"t":29892840,"type":"found_place","who":"siti","place":"provision-shop"}');
INSERT INTO "events" VALUES (14, 29892840, 'found_place', '{"seq":14,"t":29892840,"type":"found_place","who":"siti","place":"well"}');
INSERT INTO "events" VALUES (15, 29892840, 'found_place', '{"seq":15,"t":29892840,"type":"found_place","who":"siti","place":"market-stall"}');
INSERT INTO "events" VALUES (16, 29892840, 'found_place', '{"seq":16,"t":29892840,"type":"found_place","who":"muthu","place":"provision-shop"}');
INSERT INTO "events" VALUES (17, 29892840, 'found_place', '{"seq":17,"t":29892840,"type":"found_place","who":"muthu","place":"well"}');
INSERT INTO "events" VALUES (18, 29892840, 'found_place', '{"seq":18,"t":29892840,"type":"found_place","who":"muthu","place":"market-stall"}');
INSERT INTO "events" VALUES (19, 29892840, 'found_place', '{"seq":19,"t":29892840,"type":"found_place","who":"ah-seng","place":"market-stall"}');
INSERT INTO "events" VALUES (20, 29892840, 'found_place', '{"seq":20,"t":29892840,"type":"found_place","who":"ah-seng","place":"lorry-stop"}');
INSERT INTO "events" VALUES (21, 29892840, 'found_place', '{"seq":21,"t":29892840,"type":"found_place","who":"fatimah","place":"market-stall"}');
INSERT INTO "events" VALUES (22, 29892840, 'found_place', '{"seq":22,"t":29892840,"type":"found_place","who":"fatimah","place":"lorry-stop"}');
INSERT INTO "events" VALUES (23, 29892840, 'found_place', '{"seq":23,"t":29892840,"type":"found_place","who":"raju","place":"lorry-stop"}');
INSERT INTO "events" VALUES (24, 29892840, 'walked', '{"seq":24,"t":29892840,"type":"walked","who":"ah-huat","to":"the kopitiam"}');
INSERT INTO "events" VALUES (25, 29892840, 'walked', '{"seq":25,"t":29892840,"type":"walked","who":"mdm-tan","to":"the provision shop"}');
INSERT INTO "events" VALUES (26, 29892840, 'walked', '{"seq":26,"t":29892840,"type":"walked","who":"rahim","to":"the wet-market stall"}');
INSERT INTO "events" VALUES (27, 29892840, 'walked', '{"seq":27,"t":29892840,"type":"walked","who":"mei-ling","to":"south"}');
INSERT INTO "events" VALUES (28, 29892840, 'walked', '{"seq":28,"t":29892840,"type":"walked","who":"siti","to":"north"}');
INSERT INTO "events" VALUES (29, 29892840, 'walked', '{"seq":29,"t":29892840,"type":"walked","who":"muthu","to":"south"}');
INSERT INTO "events" VALUES (30, 29892840, 'walked', '{"seq":30,"t":29892840,"type":"walked","who":"ah-seng","to":"east"}');
INSERT INTO "events" VALUES (31, 29892840, 'walked', '{"seq":31,"t":29892840,"type":"walked","who":"fatimah","to":"north"}');
INSERT INTO "events" VALUES (32, 29892840, 'walked', '{"seq":32,"t":29892840,"type":"walked","who":"raju","to":"south"}');
INSERT INTO "events" VALUES (33, 29892841, 'walked', '{"seq":33,"t":29892841,"type":"walked","who":"fatimah","to":"south"}');
INSERT INTO "events" VALUES (34, 29892842, 'found_place', '{"seq":34,"t":29892842,"type":"found_place","who":"ah-huat","place":"notice-board"}');
INSERT INTO "events" VALUES (35, 29892843, 'found_place', '{"seq":35,"t":29892843,"type":"found_place","who":"rahim","place":"well"}');
INSERT INTO "events" VALUES (36, 29892843, 'found_place', '{"seq":36,"t":29892843,"type":"found_place","who":"mei-ling","place":"farm"}');
INSERT INTO "events" VALUES (37, 29892843, 'walked', '{"seq":37,"t":29892843,"type":"walked","who":"muthu","to":"north"}');
INSERT INTO "events" VALUES (38, 29892843, 'walked', '{"seq":38,"t":29892843,"type":"walked","who":"ah-seng","to":"south"}');
INSERT INTO "events" VALUES (39, 29892843, 'walked', '{"seq":39,"t":29892843,"type":"walked","who":"raju","to":"south"}');
INSERT INTO "events" VALUES (40, 29892844, 'arrived', '{"seq":40,"t":29892844,"type":"arrived","who":"ah-huat","at":"kopitiam"}');
INSERT INTO "events" VALUES (41, 29892844, 'found_place', '{"seq":41,"t":29892844,"type":"found_place","who":"ah-huat","place":"farm"}');
INSERT INTO "events" VALUES (42, 29892844, 'found_place', '{"seq":42,"t":29892844,"type":"found_place","who":"mdm-tan","place":"well"}');
INSERT INTO "events" VALUES (43, 29892844, 'price_set', '{"seq":43,"t":29892844,"type":"price_set","who":"ah-huat","shop":"kopitiam","item":"kopi","side":"sell","cents":9,"limit":null}');
INSERT INTO "events" VALUES (44, 29892845, 'found_place', '{"seq":44,"t":29892845,"type":"found_place","who":"raju","place":"jetty"}');
INSERT INTO "events" VALUES (45, 29892845, 'price_set', '{"seq":45,"t":29892845,"type":"price_set","who":"ah-huat","shop":"kopitiam","item":"fish porridge","side":"sell","cents":35,"limit":null}');
INSERT INTO "events" VALUES (46, 29892845, 'walked', '{"seq":46,"t":29892845,"type":"walked","who":"ah-kow","to":"south"}');
INSERT INTO "events" VALUES (47, 29892846, 'arrived', '{"seq":47,"t":29892846,"type":"arrived","who":"mdm-tan","at":"provision-shop"}');
INSERT INTO "events" VALUES (48, 29892846, 'price_set', '{"seq":48,"t":29892846,"type":"price_set","who":"ah-huat","shop":"kopitiam","item":"vegetable rice","side":"sell","cents":34,"limit":null}');
INSERT INTO "events" VALUES (49, 29892846, 'price_set', '{"seq":49,"t":29892846,"type":"price_set","who":"mdm-tan","shop":"provision-shop","item":"rice","side":"sell","cents":28,"limit":null}');
INSERT INTO "events" VALUES (50, 29892846, 'walked', '{"seq":50,"t":29892846,"type":"walked","who":"muthu","to":"south"}');
INSERT INTO "events" VALUES (51, 29892846, 'walked', '{"seq":51,"t":29892846,"type":"walked","who":"ah-seng","to":"north"}');
INSERT INTO "events" VALUES (52, 29892846, 'walked', '{"seq":52,"t":29892846,"type":"walked","who":"raju","to":"the jetty"}');
INSERT INTO "events" VALUES (53, 29892847, 'price_set', '{"seq":53,"t":29892847,"type":"price_set","who":"ah-huat","shop":"kopitiam","item":"fish","side":"buy","cents":23,"limit":7}');
INSERT INTO "events" VALUES (54, 29892847, 'price_set', '{"seq":54,"t":29892847,"type":"price_set","who":"mdm-tan","shop":"provision-shop","item":"coffee","side":"sell","cents":68,"limit":null}');
INSERT INTO "events" VALUES (55, 29892848, 'arrived', '{"seq":55,"t":29892848,"type":"arrived","who":"rahim","at":"market-stall"}');
INSERT INTO "events" VALUES (56, 29892848, 'found_place', '{"seq":56,"t":29892848,"type":"found_place","who":"rahim","place":"lorry-stop"}');
INSERT INTO "events" VALUES (57, 29892848, 'found_place', '{"seq":57,"t":29892848,"type":"found_place","who":"ah-kow","place":"farm"}');
INSERT INTO "events" VALUES (58, 29892848, 'price_set', '{"seq":58,"t":29892848,"type":"price_set","who":"ah-huat","shop":"kopitiam","item":"vegetables","side":"buy","cents":10,"limit":6}');
INSERT INTO "events" VALUES (59, 29892848, 'price_set', '{"seq":59,"t":29892848,"type":"price_set","who":"mdm-tan","shop":"provision-shop","item":"bread","side":"sell","cents":20,"limit":null}');
INSERT INTO "events" VALUES (60, 29892848, 'price_set', '{"seq":60,"t":29892848,"type":"price_set","who":"rahim","shop":"market-stall","item":"fish","side":"sell","cents":25,"limit":null}');
INSERT INTO "events" VALUES (61, 29892848, 'walked', '{"seq":61,"t":29892848,"type":"walked","who":"mei-ling","to":"south"}');
INSERT INTO "events" VALUES (62, 29892848, 'walked', '{"seq":62,"t":29892848,"type":"walked","who":"ah-kow","to":"the farm plot"}');
INSERT INTO "events" VALUES (63, 29892849, 'found_place', '{"seq":63,"t":29892849,"type":"found_place","who":"ah-kow","place":"kopitiam"}');
INSERT INTO "events" VALUES (64, 29892849, 'price_set', '{"seq":64,"t":29892849,"type":"price_set","who":"rahim","shop":"market-stall","item":"vegetables","side":"sell","cents":20,"limit":null}');
INSERT INTO "events" VALUES (65, 29892849, 'walked', '{"seq":65,"t":29892849,"type":"walked","who":"muthu","to":"south"}');
INSERT INTO "events" VALUES (66, 29892849, 'walked', '{"seq":66,"t":29892849,"type":"walked","who":"ah-seng","to":"the wet-market stall"}');
INSERT INTO "events" VALUES (67, 29892849, 'walked', '{"seq":67,"t":29892849,"type":"walked","who":"fatimah","to":"the wet-market stall"}');
INSERT INTO "memories" VALUES (1, 'ah-huat', 29892841, 'noticed', 'The kopitiam smells of fresh kopi.', 2);
INSERT INTO "memories" VALUES (2, 'siti', 29892842, 'plan', 'Look for work at the market this morning.', 5);
INSERT INTO "memories" VALUES (3, 'raju', 29892844, 'thought', 'Muthu will know who is hiring.', 4);
INSERT INTO "meta" VALUES ('schema', '1');
INSERT INTO "snapshot" VALUES (1, 29892849, '{"version":1,"seed":7,"t":29892849,"rng":1135788953,"nextId":0,"eventSeq":67,"ledgerSeq":0,"residents":[{"id":"ah-huat","name":"Ah Huat","role":"owner","homeId":"house-1","pos":{"x":6,"y":9},"money":6046,"items":{},"hunger":160,"energy":944,"activity":null,"thinkAt":29892854,"recent":[],"reply":null,"knownPlaces":["house-1","kopitiam","house-2","house-3","notice-board","farm"],"knownPeople":["mdm-tan"]},{"id":"mdm-tan","name":"Mdm Tan","role":"owner","homeId":"house-2","pos":{"x":17,"y":8},"money":6247,"items":{},"hunger":160,"energy":944,"activity":null,"thinkAt":29892854,"recent":[],"reply":null,"knownPlaces":["house-2","provision-shop","house-1","house-3","kopitiam","notice-board","house-4","house-5","house-6","well"],"knownPeople":["rahim","ah-kow","mei-ling"]},{"id":"rahim","name":"Rahim","role":"owner","homeId":"house-3","pos":{"x":28,"y":8},"money":9908,"items":{},"hunger":160,"energy":944,"activity":null,"thinkAt":29892850,"recent":[],"reply":{"ok":true,"text":"You''ll sell vegetables at 20¢ each."},"knownPlaces":["house-3","market-stall","house-2","house-4","kopitiam","notice-board","provision-shop","house-5","house-6","well","house-7","house-8","house-9","lorry-stop"],"knownPeople":["mei-ling","ah-kow","muthu"]},{"id":"mei-ling","name":"Mei Ling","role":"seeker","homeId":"house-4","pos":{"x":13,"y":12},"money":1549,"items":{},"hunger":160,"energy":944,"activity":{"kind":"walking","path":[{"x":13,"y":13},{"x":13,"y":14},{"x":13,"y":15},{"x":13,"y":16},{"x":13,"y":17},{"x":13,"y":18},{"x":14,"y":18}],"dest":null,"thenSleep":false},"thinkAt":29892849,"recent":[],"reply":{"ok":true,"text":"You set off for south."},"knownPlaces":["house-4","house-3","house-5","kopitiam","notice-board","provision-shop","farm"],"knownPeople":["rahim","mdm-tan","ah-kow"]},{"id":"ah-kow","name":"Ah Kow","role":"seeker","homeId":"house-5","pos":{"x":15,"y":10},"money":1282,"items":{},"hunger":160,"energy":944,"activity":{"kind":"walking","path":[{"x":14,"y":10},{"x":13,"y":10},{"x":13,"y":11},{"x":13,"y":12},{"x":13,"y":13},{"x":13,"y":14},{"x":13,"y":15},{"x":13,"y":16},{"x":13,"y":17},{"x":13,"y":18},{"x":12,"y":18},{"x":11,"y":18},{"x":10,"y":18},{"x":9,"y":18},{"x":8,"y":18},{"x":7,"y":18}],"dest":"farm","thenSleep":false},"thinkAt":29892849,"recent":[],"reply":{"ok":true,"text":"You set off for the farm plot."},"knownPlaces":["house-5","house-4","house-6","notice-board","provision-shop","well","farm","kopitiam"],"knownPeople":["siti","rahim","mdm-tan","mei-ling"]},{"id":"siti","name":"Siti","role":"seeker","homeId":"house-6","pos":{"x":22,"y":0},"money":1108,"items":{},"hunger":160,"energy":944,"activity":null,"thinkAt":29892851,"recent":[],"reply":null,"knownPlaces":["house-6","house-5","house-7","provision-shop","well","market-stall"],"knownPeople":[]},{"id":"muthu","name":"Muthu","role":"seeker","homeId":"house-7","pos":{"x":26,"y":10},"money":1199,"items":{},"hunger":160,"energy":944,"activity":{"kind":"walking","path":[{"x":26,"y":11},{"x":26,"y":12},{"x":26,"y":13},{"x":26,"y":14},{"x":26,"y":15},{"x":26,"y":16},{"x":26,"y":17},{"x":26,"y":18}],"dest":null,"thenSleep":false},"thinkAt":29892850,"recent":[],"reply":{"ok":true,"text":"You set off for south."},"knownPlaces":["house-7","house-6","house-8","provision-shop","well","market-stall"],"knownPeople":["rahim"]},{"id":"ah-seng","name":"Ah Seng","role":"seeker","homeId":"house-8","pos":{"x":38,"y":2},"money":860,"items":{},"hunger":160,"energy":944,"activity":{"kind":"walking","path":[{"x":38,"y":3},{"x":38,"y":4},{"x":37,"y":4},{"x":36,"y":4},{"x":35,"y":4},{"x":34,"y":4},{"x":33,"y":4},{"x":32,"y":4},{"x":32,"y":5},{"x":32,"y":6},{"x":32,"y":7},{"x":32,"y":8},{"x":31,"y":8},{"x":30,"y":8},{"x":29,"y":8},{"x":28,"y":8}],"dest":"market-stall","thenSleep":false},"thinkAt":29892850,"recent":[],"reply":{"ok":true,"text":"You set off for the wet-market stall."},"knownPlaces":["house-8","house-7","house-9","market-stall","lorry-stop","house-10"],"knownPeople":["ah-huat","fatimah","raju"]},{"id":"fatimah","name":"Fatimah","role":"seeker","homeId":"house-9","pos":{"x":34,"y":8},"money":1330,"items":{},"hunger":160,"energy":944,"activity":{"kind":"walking","path":[{"x":33,"y":8},{"x":32,"y":8},{"x":31,"y":8},{"x":30,"y":8},{"x":29,"y":8},{"x":28,"y":8}],"dest":"market-stall","thenSleep":false},"thinkAt":29892850,"recent":[],"reply":{"ok":true,"text":"You set off for the wet-market stall."},"knownPlaces":["house-9","house-8","house-10","market-stall","lorry-stop"],"knownPeople":["ah-seng","raju"]},{"id":"raju","name":"Raju","role":"seeker","homeId":"house-10","pos":{"x":32,"y":21},"money":1595,"items":{},"hunger":160,"energy":944,"activity":{"kind":"walking","path":[{"x":32,"y":22},{"x":32,"y":23},{"x":32,"y":24},{"x":32,"y":25},{"x":32,"y":26},{"x":32,"y":27},{"x":31,"y":27}],"dest":"jetty","thenSleep":false},"thinkAt":29892847,"recent":[],"reply":{"ok":true,"text":"You set off for the jetty."},"knownPlaces":["house-10","house-9","lorry-stop","jetty"],"knownPeople":[]}],"shops":[{"id":"kopitiam","ownerId":"ah-huat","stock":{"coffee":3,"rice":4,"fish":2,"vegetables":2,"kopi":10,"fish porridge":4,"vegetable rice":4},"sellPrices":{"kopi":9,"fish porridge":35,"vegetable rice":34},"buyPrices":{"fish":23,"vegetables":10},"buyLimits":{"fish":7,"vegetables":6}},{"id":"provision-shop","ownerId":"mdm-tan","stock":{"rice":20,"coffee":6,"bread":10},"sellPrices":{"rice":28,"coffee":68,"bread":20},"buyPrices":{},"buyLimits":{}},{"id":"market-stall","ownerId":"rahim","stock":{"fish":6,"vegetables":6},"sellPrices":{"fish":25,"vegetables":20},"buyPrices":{},"buyLimits":{}}],"jobs":[],"jobOffers":[],"trades":[],"owed":[],"beds":[{"n":1,"planterId":null,"plantedDay":0,"wateredDays":0,"lastWateredDay":null},{"n":2,"planterId":null,"plantedDay":0,"wateredDays":0,"lastWateredDay":null},{"n":3,"planterId":null,"plantedDay":0,"wateredDays":0,"lastWateredDay":null},{"n":4,"planterId":null,"plantedDay":0,"wateredDays":0,"lastWateredDay":null},{"n":5,"planterId":null,"plantedDay":0,"wateredDays":0,"lastWateredDay":null},{"n":6,"planterId":null,"plantedDay":0,"wateredDays":0,"lastWateredDay":null},{"n":7,"planterId":null,"plantedDay":0,"wateredDays":0,"lastWateredDay":null},{"n":8,"planterId":null,"plantedDay":0,"wateredDays":0,"lastWateredDay":null}],"notes":[],"lorryHere":false,"firsts":[],"talk":{}}', '{"ah-huat":{"rng":4231081533,"lorryDay":null,"buyDays":{"fish":"Monday","vegetables":"Monday"}},"mdm-tan":{"rng":3031456119,"lorryDay":null,"buyDays":{}},"rahim":{"rng":3663396518,"lorryDay":null,"buyDays":{}},"mei-ling":{"rng":4231395720,"lorryDay":null,"buyDays":{}},"ah-kow":{"rng":568368823,"lorryDay":null,"buyDays":{}},"siti":{"rng":568473552,"lorryDay":null,"buyDays":{}},"muthu":{"rng":3599874237,"lorryDay":null,"buyDays":{}},"ah-seng":{"rng":3599978966,"lorryDay":null,"buyDays":{}},"fatimah":{"rng":4231919365,"lorryDay":null,"buyDays":{}},"raju":{"rng":568892468,"lorryDay":null,"buyDays":{}}}');

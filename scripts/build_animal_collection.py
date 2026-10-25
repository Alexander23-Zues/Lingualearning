"""Build original supplemental learning content and its reviewable SQL migration.

Public assets exclude quiz keys. Preview-only keys are compiled only by main_preview.
"""
import json
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "apps/linguakids_app"
SOURCE = "LinguaKids original animal adventures · supplemental enrichment v2"

STORIES = [
    ("forest-friends", "Finn and the Friendship Picnic", "Si Finn at ang Piknik ng Magkakaibigan", 0,
     "A fox learns that a happy adventure leaves no friend behind.", [
      ("Finn the little fox tied his blue scarf and stepped into the sunny forest. Today was the friendship picnic, and he could hardly wait to see his friends.", "Itinali ng munting soro na si Finn ang kaniyang asul na bandana at lumabas sa maaraw na kagubatan. Araw ng piknik ng magkakaibigan, at sabik na siyang makita sila.", 0),
      ("Beside the path, Tali the turtle carried a basket of apples. ‘Good morning, Finn!’ she said. ‘May I walk with you?’ Finn smiled and said, ‘Of course!’", "Sa tabi ng daan, may dalang basket ng mansanas ang pagong na si Tali. ‘Magandang umaga, Finn!’ sabi niya. ‘Maaari ba akong sumabay?’ Ngumiti si Finn. ‘Siyempre!’", 0),
      ("Finn took three quick steps, but Tali took one careful step. When Finn looked back, his friend was far behind. He stopped and listened to the birds while he waited.", "Tatlong mabilis na hakbang ang ginawa ni Finn, ngunit isang maingat na hakbang pa lamang si Tali. Nang lumingon siya, malayo pa ang kaniyang kaibigan. Huminto siya at nakinig sa mga ibon habang naghihintay.", 0),
      ("Soon they reached a little bridge above a clear stream. Tali felt nervous. ‘We can cross slowly,’ said Finn. ‘I will stay beside you.’ Together, they took one small step at a time.", "Nakarating sila sa maliit na tulay sa ibabaw ng malinaw na batis. Kinabahan si Tali. ‘Dahan-dahan tayong tumawid,’ sabi ni Finn. ‘Mananatili ako sa tabi mo.’ Sabay silang humakbang nang paunti-unti.", 1),
      ("Halfway across, a red apple rolled out of the basket. Finn caught it before it reached the water. ‘Thank you for helping!’ said Tali. ‘Thank you for trusting me,’ Finn replied.", "Sa gitna ng tulay, gumulong palabas ng basket ang isang pulang mansanas. Nasalo ito ni Finn bago mahulog sa tubig. ‘Salamat sa tulong!’ sabi ni Tali. ‘Salamat sa pagtitiwala,’ sagot ni Finn.", 1),
      ("On the other side, Rina the rabbit waved from a field of flowers. ‘I found a lovely picnic spot!’ she called. She had brought a soft blanket and a book of funny poems.", "Sa kabilang panig, kumaway ang kuneho na si Rina mula sa parang ng mga bulaklak. ‘May nakita akong magandang lugar para sa piknik!’ tawag niya. May dala siyang malambot na kumot at aklat ng nakatutuwang tula.", 2),
      ("The friends spread the blanket under a shady tree. Finn placed the apples in the middle. Tali poured water into three cups, and Rina opened her colorful book.", "Inilatag ng magkakaibigan ang kumot sa ilalim ng malilim na puno. Inilagay ni Finn ang mga mansanas sa gitna. Nagsalin si Tali ng tubig sa tatlong tasa, at binuksan ni Rina ang makulay niyang aklat.", 2),
      ("They took turns reading the poems. Finn read loudly, Tali read slowly, and Rina made a silly voice for every animal. Their laughter floated through the leaves.", "Nagpalitan sila sa pagbasa ng mga tula. Malakas bumasa si Finn, mabagal bumasa si Tali, at may nakatutuwang boses si Rina para sa bawat hayop. Umalingawngaw ang kanilang tawanan sa mga dahon.", 3),
      ("As the sky turned gold, Finn thought about their walk. Racing to the picnic would have been fast, but walking together had made the whole day special. He was glad he had waited.", "Nang maging ginintuang kulay ang langit, naisip ni Finn ang kanilang paglalakad. Mas mabilis sana kung nagmadali siya, ngunit naging espesyal ang araw dahil magkakasama sila. Masaya siyang naghintay.", 3),
      ("Before going home, they picked up every cup and apple core. ‘Next time, we will bring more friends,’ said Finn. Tali and Rina nodded. A good adventure always has room for kindness.", "Bago umuwi, pinulot nila ang lahat ng tasa at mga pinagkainan ng mansanas. ‘Sa susunod, magyayaya pa tayo ng ibang kaibigan,’ sabi ni Finn. Tumango sina Tali at Rina. Laging may puwang para sa kabutihan ang isang magandang pakikipagsapalaran.", 3),
     ]),
    ("ocean-team", "Ollie's Sparkling Ocean", "Ang Kumikinang na Dagat ni Ollie", 4,
     "An octopus and two friends discover what teamwork can do for their reef.", [
      ("Ollie the purple octopus wore his yellow explorer hat. He loved the coral garden, where tiny fish darted between pink branches and blue bubbles rose toward the sunlight.", "Suot ng lilang pugita na si Ollie ang kaniyang dilaw na sombrero. Mahal niya ang hardin ng mga korales, kung saan lumalangoy ang maliliit na isda sa pagitan ng mga rosas na sanga at umaakyat ang mga bula sa liwanag.", 4),
      ("Dina the dolphin and Tiko the sea turtle came to visit. ‘Let us count the fish!’ said Dina. They found one striped fish, two yellow fish, and a whole school of silver fish.", "Dumalaw sina Dina na dolpin at Tiko na pawikan. ‘Bilangin natin ang mga isda!’ sabi ni Dina. Nakakita sila ng isang isdang may guhit, dalawang dilaw na isda, at isang pangkat ng makikintab na isda.", 4),
      ("Near a patch of coral, Ollie noticed a bottle and a loose plastic bag. The garden did not look as bright there. ‘These things do not belong in our home,’ he said softly.", "Malapit sa isang korales, may napansing bote at plastik na supot si Ollie. Hindi gaanong maaliwalas ang bahaging iyon ng hardin. ‘Hindi ito dapat narito sa ating tahanan,’ mahinahon niyang sabi.", 5),
      ("The friends stopped to make a careful plan. They would leave the living coral alone, collect only the loose litter, and ask the reef helpers where to put it. Everyone would have a job.", "Huminto ang magkakaibigan upang gumawa ng maingat na plano. Hindi nila gagalawin ang buhay na korales. Pupulutin lamang nila ang nakakalat na basura at itatanong sa mga tagapag-alaga kung saan ito ilalagay. May gawain ang bawat isa.", 5),
      ("Ollie gently lifted the empty bottle. Dina carried a floating basket, and Tiko looked for other pieces of litter. They worked slowly so the little fish could swim safely past them.", "Maingat na inangat ni Ollie ang walang lamang bote. Dala ni Dina ang lumulutang na basket, at naghanap si Tiko ng iba pang basura. Dahan-dahan silang kumilos upang ligtas na makadaan ang maliliit na isda.", 6),
      ("A current pushed the basket to one side. ‘I need a little help!’ called Dina. Tiko steadied one edge while Ollie held the other. Together they kept every collected piece inside.", "Itinulak ng agos ang basket sa isang panig. ‘Kailangan ko ng kaunting tulong!’ tawag ni Dina. Inalalayan ni Tiko ang isang gilid habang hinawakan ni Ollie ang kabila. Sama-sama nilang napanatili ang mga napulot sa loob.", 6),
      ("When the basket was full, the reef helpers took it to a safe collection place. Ollie looked back at the coral garden. There was room for the fish to explore again.", "Nang mapuno ang basket, dinala ito ng mga tagapag-alaga sa ligtas na lagayan. Lumingon si Ollie sa hardin ng korales. May maluwag nang lugar na muling mapaglalaruan ng mga isda.", 6),
      ("Dina made a trail of joyful bubbles. Tiko found a shiny shell resting in the sand. Ollie counted the colors around them: yellow fish, orange coral, green seaweed, and a bright blue sea.", "Gumawa si Dina ng hanay ng masasayang bula. Nakakita si Tiko ng makintab na kabibe sa buhangin. Binilang ni Ollie ang mga kulay sa paligid: dilaw na isda, kahel na korales, berdeng halamang-dagat, at bughaw na dagat.", 7),
      ("‘One friend could not have carried that big basket,’ said Tiko. ‘But three friends could!’ Ollie grinned. Their different talents had helped them care for the same beautiful home.", "‘Hindi kayang buhatin ng isang kaibigan ang malaking basket na iyon,’ sabi ni Tiko. ‘Pero kinaya ng tatlong magkakaibigan!’ Napangiti si Ollie. Nakatulong ang magkakaiba nilang kakayahan sa pag-aalaga sa iisang magandang tahanan.", 7),
      ("Before they went home, the friends promised to keep caring for the reef. They would use fewer throwaway things and remind their neighbors to put litter in the right place. The ocean sparkled around them.", "Bago umuwi, nangako ang magkakaibigan na patuloy na aalagaan ang bahura. Babawasan nila ang mga gamit na itinatapon agad at ipaaalala sa mga kapitbahay ang tamang pagtatapon ng basura. Kumikinang ang dagat sa kanilang paligid.", 7),
     ]),
    ("garden-team", "Milo and the Little Seed", "Si Milo at ang Munting Binhi", 8,
     "A rabbit, a hedgehog, and a frog learn patience in their colorful garden.", [
      ("Milo the rabbit found a tiny seed in a paper packet. He put on his yellow overalls and hurried to the school garden. ‘How can something so small become a plant?’ he wondered.", "Nakakita ang kunehong si Milo ng munting binhi sa isang supot na papel. Isinuot niya ang dilaw niyang oberol at nagtungo sa hardin ng paaralan. ‘Paano magiging halaman ang napakaliit na ito?’ tanong niya sa sarili.", 8),
      ("Hana the hedgehog brought a little shovel. Together they loosened the soil and made a small hole. Milo placed the seed inside, and Hana covered it gently with soft earth.", "May dalang maliit na pala ang hedgehog na si Hana. Sama-sama nilang binungkal ang lupa at gumawa ng maliit na hukay. Inilagay ni Milo ang binhi sa loob at marahang tinabunan ni Hana ng malambot na lupa.", 8),
      ("Milo watched the garden all afternoon, but nothing seemed to happen. ‘Is the seed asleep?’ he asked. Hana smiled. ‘It is getting ready. Growing takes time.’", "Buong hapong binantayan ni Milo ang hardin, ngunit tila walang nangyayari. ‘Natutulog ba ang binhi?’ tanong niya. Ngumiti si Hana. ‘Naghahanda pa ito. Kailangan ng panahon upang lumaki.’", 8),
      ("The next morning, Fifi the frog brought a watering can. They gave the soil a gentle drink. A tiny green sprout appeared a few days later, and Milo cheered so softly that he would not scare it.", "Kinaumagahan, nagdala ng pandilig ang palakang si Fifi. Marahan nilang diniligan ang lupa. Pagkaraan ng ilang araw, lumitaw ang munting berdeng usbong. Mahinang natuwa si Milo upang hindi ito magulat.", 9),
      ("Each friend chose a garden job. Milo checked the leaves, Hana loosened the soil, and Fifi helped with watering. They used only the water the young plants needed and saved the rest.", "Pumili ng gawain sa hardin ang bawat kaibigan. Sinuri ni Milo ang mga dahon, binungkal ni Hana ang lupa, at tumulong si Fifi sa pagdidilig. Sapat na tubig lamang ang ginamit nila para sa mga halaman.", 9),
      ("One afternoon, gray clouds covered the sky. Rain tapped the garden fence. The friends watched from a dry shelter and made sure their young plants were safe from the strongest drops.", "Isang hapon, natakpan ng abong ulap ang langit. Tumama ang ulan sa bakod ng hardin. Nagmasid ang magkakaibigan mula sa tuyong silungan at tiniyak na ligtas ang mga halaman sa pinakamalalakas na patak.", 10),
      ("When the rain slowed, a rainbow appeared. Water shone on every leaf. ‘The garden has a necklace of little stars!’ said Milo. Fifi laughed and pointed to a new leaf opening near the soil.", "Nang humina ang ulan, lumitaw ang bahaghari. Kumikinang ang tubig sa bawat dahon. ‘May kuwintas ng maliliit na bituin ang hardin!’ sabi ni Milo. Tumawa si Fifi at itinuro ang bagong dahong bumubuka malapit sa lupa.", 10),
      ("Weeks passed. The sunflowers grew taller, the tomatoes turned red, and orange carrots hid beneath the soil. The tiny seed had become part of a garden full of color and life.", "Lumipas ang mga linggo. Tumangkad ang mga mirasol, namula ang mga kamatis, at nakatago ang mga kahel na karot sa ilalim ng lupa. Naging bahagi ng makulay at buhay na hardin ang munting binhi.", 11),
      ("The friends picked only the vegetables that were ready. They shared a basket with the other animals at school. Milo gave Hana a tomato, and Fifi chose a bright orange carrot.", "Pinitas lamang ng magkakaibigan ang mga gulay na maaari nang anihin. Nagbahagi sila ng isang basket sa iba pang hayop sa paaralan. Binigyan ni Milo si Hana ng kamatis, at pumili si Fifi ng matingkad na kahel na karot.", 11),
      ("Milo kept one new seed for another day. ‘Now I know the secret,’ he said. ‘A little care, a little teamwork, and a lot of patience can help wonderful things grow.’", "Nagtago si Milo ng isang bagong binhi para sa susunod. ‘Alam ko na ang sikreto,’ sabi niya. ‘Kaunting pag-aalaga, pagtutulungan, at mahabang pasensiya ang kailangan upang lumago ang magagandang bagay.’", 11),
     ]),
    ("moon-library", "Luna's Moonlight Library", "Ang Aklatan ni Luna sa Liwanag ng Buwan", 12,
     "An owl and her friends follow a trail of kindness and return to a warm book.", [
      ("Luna the little owl opened the tree library as the moon rose. Warm lanterns glowed beside the shelves. Kiki the kitten and Suri the squirrel curled up near a big purple book.", "Binuksan ng munting kuwagong si Luna ang aklatan sa puno habang sumisikat ang buwan. Maliwanag ang mga parol sa tabi ng mga istante. Umupo sina Kiki na kuting at Suri na ardilya malapit sa malaking lilang aklat.", 12),
      ("‘Tonight we will read about brave little helpers,’ said Luna. Kiki chose a soft cushion, and Suri found a blanket. Outside, fireflies blinked like tiny lamps among the leaves.", "‘Ngayong gabi, babasa tayo tungkol sa matatapang na munting katulong,’ sabi ni Luna. Pumili si Kiki ng malambot na unan at kumuha si Suri ng kumot. Sa labas, kumikislap ang mga alitaptap na parang maliliit na ilaw sa mga dahon.", 12),
      ("Just as Luna began the first page, they heard a gentle chirp from the path. ‘Someone may need a friend,’ she said. The three put on their scarves and stayed together as they stepped outside.", "Nang simulan ni Luna ang unang pahina, may narinig silang mahinang huni mula sa daan. ‘Maaaring may nangangailangan ng kaibigan,’ sabi niya. Isinuot nilang tatlo ang mga bandana at magkakasamang lumabas.", 13),
      ("The moon lit the familiar path, and the fireflies glowed ahead. Suri carried a little lantern. Kiki listened carefully, while Luna watched the branches from just above her friends.", "Tinanglawan ng buwan ang pamilyar na daan, at kumikislap ang mga alitaptap sa unahan. May dalang maliit na parol si Suri. Maingat na nakinig si Kiki habang binabantayan ni Luna ang mga sanga sa itaas ng kaniyang mga kaibigan.", 13),
      ("Under an old tree sat a tiny yellow bird named Pip. He had taken the wrong path and felt cold and worried. ‘You are not alone now,’ said Kiki. She sat nearby so Pip would feel safe.", "Sa ilalim ng matandang puno, nakaupo ang munting dilaw na ibong si Pip. Napunta siya sa maling daan kaya nilalamig at nag-aalala. ‘May kasama ka na ngayon,’ sabi ni Kiki. Umupo siya sa tabi upang mapanatag si Pip.", 14),
      ("Suri offered Pip a warm red scarf. Luna spoke in a calm voice. ‘We can rest at the library while we ask a trusted grown-up to help you find your family.’ Pip gave a small, hopeful smile.", "Inalok ni Suri si Pip ng mainit na pulang bandana. Mahinahon ang boses ni Luna. ‘Maaari kang magpahinga sa aklatan habang humihingi tayo ng tulong sa isang mapagkakatiwalaang nakatatanda upang mahanap ang pamilya mo.’ Bahagyang ngumiti si Pip.", 14),
      ("They walked back along the same safe path. Luna flew slowly, Suri held the lantern, and Kiki stayed beside Pip. No one hurried, and no one was left behind.", "Bumalik sila sa parehong ligtas na daan. Dahan-dahang lumipad si Luna, hawak ni Suri ang parol, at nanatili si Kiki sa tabi ni Pip. Walang nagmadali, at walang naiwan.", 14),
      ("At the library, a trusted grown-up helped Pip's family know where he was. Pip warmed his feet on a cushion. The purple book waited patiently on Luna's reading table.", "Sa aklatan, tumulong ang isang mapagkakatiwalaang nakatatanda upang malaman ng pamilya ni Pip kung nasaan siya. Nagpahinga si Pip sa unan. Matiyagang naghihintay ang lilang aklat sa mesa ni Luna.", 15),
      ("‘May I listen too?’ asked Pip. ‘There is always room for another reader,’ Luna replied. This time, she read the story with four happy listeners sharing the warm library light.", "‘Maaari rin ba akong makinig?’ tanong ni Pip. ‘Laging may puwang para sa isa pang mambabasa,’ sagot ni Luna. Sa pagkakataong ito, masayang nagbahagi ang magkakaibigan ng liwanag ng aklatan habang nakikinig sa kuwento.", 15),
      ("When Pip's family arrived, everyone smiled. Luna closed the book and looked at her friends. They had not only read about kindness that night. They had made a kindness story of their own.", "Nang dumating ang pamilya ni Pip, napangiti ang lahat. Isinara ni Luna ang aklat at tumingin sa mga kaibigan. Hindi lamang sila bumasa tungkol sa kabutihan nang gabing iyon. Gumawa rin sila ng sarili nilang kuwento ng kabutihan.", 15),
     ]),
]

QUIZZES = [
 ("animal-words", "Animal Friends Word Quiz", 0, [
  ("Which Filipino word means cat?", ["pusa", "aso", "ibon", "isda"], "pusa", "🐱"),
  ("Which animal says 'woof'?", ["dog", "fish", "owl", "rabbit"], "dog", "🐶"),
  ("Which Filipino word means bird?", ["ibon", "puno", "araw", "aklat"], "ibon", "🐦"),
  ("Which animal can swim in the ocean?", ["dolphin", "rabbit", "cat", "fox"], "dolphin", "🐬"),
  ("Which Filipino word means fish?", ["isda", "pusa", "aso", "ibon"], "isda", "🐠"),
  ("Which animal has a shell on its back?", ["turtle", "owl", "fox", "kitten"], "turtle", "🐢"),
 ]),
 ("garden-words", "Garden Colors and Nature Quiz", 8, [
  ("Which Filipino word means sun?", ["araw", "buwan", "ulan", "hangin"], "araw", "☀️"),
  ("What do we use to water a plant?", ["water", "sand", "paper", "paint"], "water", "💧"),
  ("Which Filipino word means tree?", ["puno", "pusa", "pinto", "pula"], "puno", "🌳"),
  ("What color is a ripe red tomato?", ["red", "blue", "purple", "white"], "red", "🍅"),
  ("Which Filipino word means flower?", ["bulaklak", "sapatos", "mesa", "aklat"], "bulaklak", "🌸"),
  ("What helps a tiny seed grow?", ["water and sunlight", "plastic bags", "toy cars", "crayons"], "water and sunlight", "🌱"),
 ]),
 ("kind-choices", "Kind Choices Adventure Quiz", 12, [
  ("Your friend walks slowly. What is kind?", ["wait and walk together", "leave your friend", "hide the path", "laugh at your friend"], "wait and walk together", "🦊"),
  ("Someone helps you. What can you say?", ["thank you", "go away", "give me more", "nothing"], "thank you", "💛"),
  ("Which Filipino word means thank you?", ["salamat", "paalam", "bukas", "ulan"], "salamat", "🐰"),
  ("You want to borrow a book. What can you say?", ["May I borrow it, please?", "That is mine!", "I will take it!", "You cannot read!"], "May I borrow it, please?", "📚"),
  ("A little bird is lost. Who can help?", ["a trusted grown-up", "a stranger online", "nobody", "a toy"], "a trusted grown-up", "🐤"),
  ("Your group has a big job. What helps?", ["working together", "arguing", "hiding the tools", "giving up at once"], "working together", "🐢"),
 ]),
 ("story-explorer", "Animal Story Explorer Quiz", 4, [
  ("In Finn's story, what did Tali carry?", ["a basket of apples", "a telescope", "a drum", "a kite"], "a basket of apples", "🍎"),
  ("What did Ollie and his friends clean?", ["their ocean reef", "a classroom wall", "the moon", "a mountain road"], "their ocean reef", "🐙"),
  ("What did Milo plant in the garden?", ["a seed", "a book", "a scarf", "a shell"], "a seed", "🌱"),
  ("Where did Luna read with her friends?", ["a tree library", "a busy road", "a shopping cart", "a boat engine"], "a tree library", "🦉"),
  ("Which friend was a rabbit?", ["Milo", "Ollie", "Dina", "Luna"], "Milo", "🐇"),
  ("What do all four stories celebrate?", ["kindness and teamwork", "winning every race", "keeping every toy", "never asking for help"], "kindness and teamwork", "🌟"),
 ]),
]

GAMES = [
 ("pet-pairs", "Pet Pals: Match the Words", 0, [("cat","pusa","🐱"),("dog","aso","🐶"),("bird","ibon","🐦"),("fish","isda","🐠")]),
 ("ocean-pairs", "Ocean Explorers: Word Match", 4, [("water","tubig","💧"),("fish","isda","🐠"),("shell","kabibe","🐚"),("sea","dagat","🌊")]),
 ("garden-pairs", "Garden Buddies: Word Match", 8, [("tree","puno","🌳"),("flower","bulaklak","🌸"),("sun","araw","☀️"),("seed","binhi","🌱")]),
 ("night-pairs", "Moonlight Friends: Word Match", 12, [("moon","buwan","🌙"),("star","bituin","⭐"),("book","aklat","📚"),("friend","kaibigan","🐤")]),
]

def uid(label):
    return str(uuid5(NAMESPACE_URL,"https://linguakids.local/animal-collection/v2/"+label))

def build():
    materials, keys = [], {}
    for grade in range(1,7):
        def add(slug,kind,title,summary,body):
            identifier=uid(f"{grade}/{slug}")
            materials.append({"id":identifier,"owner_id":None,"kind":kind,"title":title,"grade_level":grade,
                "learning_level":"beginner","summary":summary,"source_label":SOURCE,"body":body,"status":"published","version":1})
            return identifier
        for slug,title,fil_title,scene,summary,pages in STORIES:
            add(slug,"story",title,summary,{"cover_scene":scene,"filipino_title":fil_title,"theme":"kindness and teamwork",
                "pages":[{"english":en,"filipino":fil,"scene":art,"illustration":"animal-story"} for en,fil,art in pages]})
        for slug,title,scene,questions in QUIZZES:
            rows=[]; key={}
            identifier=uid(f"{grade}/{slug}")
            for index,(prompt,choices,correct,emoji) in enumerate(questions):
                question_id=uid(f"{slug}/q{index}")
                shift=index%4
                rotated=choices[shift:]+choices[:shift]
                options=[{"id":uid(f"{slug}/q{index}/{value}"),"text":value} for value in rotated]
                rows.append({"id":question_id,"prompt":prompt,"emoji":emoji,"options":options})
                key[question_id]=next(o["id"] for o in options if o["text"]==correct)
            keys[identifier]=key
            add(slug,"quiz",title,"Six friendly questions. Tap A, B, C, or D, then check your answers.",{"cover_scene":scene,"questions":rows})
        for slug,title,scene,pairs in GAMES:
            add(slug,"game",title,"Tap a word, then tap its Filipino partner. Match all four pairs!",{"cover_scene":scene,"pairs":[{"en":en,"fil":fil,"emoji":emoji} for en,fil,emoji in pairs]})
    return materials, keys

def write_outputs(migration_path):
    materials,keys=build()
    output=APP/'assets/content/animal_collection.json'
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps({"collection":"animal-adventures-v2","materials":materials},ensure_ascii=False,indent=2),encoding='utf-8')
    dart=APP/'lib/preview/animal_collection_data.dart'
    dart.write_text('// Generated by scripts/build_animal_collection.py. Imported only by the local preview.\n'
      "const animalPreviewMaterialsJson = r'''"+json.dumps(materials,ensure_ascii=False)+"''';\n"
      "const animalPreviewAnswerKeysJson = r'''"+json.dumps(keys,ensure_ascii=False)+"''';\n",encoding='utf-8')
    payload=[]
    for m in materials[:12]:
        copies=[row for row in materials if row['title']==m['title'] and row['kind']==m['kind']]
        payload.append({**m,"answer_key":keys.get(m['id'],{}),"grade_ids":[row['id'] for row in copies]})
    data=json.dumps(payload,ensure_ascii=False)
    sql="""-- Original supplemental animal collection. No private adult-authored materials are changed.
-- Question keys are stored only in the private answer table, never in body JSON.
do $collection$
declare item jsonb; existing_source text; changed integer:=0; g integer; v_material_id uuid;
begin
  for item in select value from jsonb_array_elements($animal_data$"""+data+"""$animal_data$::jsonb) loop
    for g in 1..6 loop
    v_material_id:=(item->'grade_ids'->>(g-1))::uuid;
    select source_label into existing_source from public.learning_materials where id=v_material_id;
    if found and existing_source <> item->>'source_label' then raise exception 'An existing material uses a reserved collection identifier'; end if;
    insert into public.learning_materials(id,owner_id,kind,title,grade_level,learning_level,summary,source_label,body,status,version)
    values(v_material_id,null,item->>'kind',item->>'title',g,
      item->>'learning_level',item->>'summary',item->>'source_label',item->'body','published',1)
    on conflict(id) do nothing;
    if found then changed:=changed+1; end if;
    insert into private.material_answers(material_id,answers) values(v_material_id,item->'answer_key')
      on conflict(material_id) do nothing;
    end loop;
  end loop;
  -- Additive install: existing materials, statuses, and progress remain untouched.
  if changed>0 then insert into public.audit_logs(action,entity_type,metadata)
    values('animal_collection_installed','learning_material',jsonb_build_object('materials',changed,'stories',24,'quiz_questions',144,'source','original supplemental enrichment v2')); end if;
end $collection$;
notify pgrst,'reload schema';
"""
    migration_path.write_text(sql,encoding='utf-8')
    (ROOT/'docs/animal-art-prompt.md').write_text('''# Animal story artwork

Built-in image generation was used to create `apps/linguakids_app/assets/images/animal-story-atlas.png`.
The app displays regions directly from this unmodified 4-by-4 image sheet.

Prompt: Create a single square 4-column by 4-row atlas, sixteen equal independent cartoon storybook scenes, no gaps, text, numbers, borders, or watermark. Warm colorful original animal characters, consistent within each row. Row 1: orange fox with blue scarf and teal turtle meet in a sunny forest, cross a bridge, meet a rabbit in flowers, share a picnic and books. Row 2: purple octopus with yellow hat, dolphin, and sea turtle explore coral, notice litter, carry it to a basket, celebrate a clean reef. Row 3: rabbit in yellow overalls, hedgehog, and frog plant seeds, water sprouts, shelter from rain, share a colorful harvest. Row 4: owl with spectacles, kitten, and squirrel read in a cozy tree library, follow fireflies, help a tiny yellow bird with a scarf, read together in the warm library. Bright mint, coral, sunflower, lavender, and sky blue; polished children's picture-book art with expressive friendly animals.
''',encoding='utf-8')
    print(f'Created {len(materials)} grade-specific materials: four ten-page stories, four six-question quizzes, and four matching games per grade.')

if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser()
    parser.add_argument('--migration',type=Path,required=True)
    write_outputs(parser.parse_args().migration)

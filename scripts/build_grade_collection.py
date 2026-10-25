"""Original, progressively harder bilingual enrichment; no curriculum certification."""
import argparse
import json
from pathlib import Path
from uuid import uuid5, NAMESPACE_URL

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'apps/linguakids_app'
SOURCE = 'LinguaKids grade pathways · original supplemental enrichment v3'

# grade, title, scene, bilingual teaching paragraphs, four vocabulary pairs,
# two application questions (first answer is correct before rotation).
UNITS = [
(1, 'Animal friends', 0,
 [('A noun names an animal, person, place, or thing. Today we will name four animal friends: cat, dog, bird, and fish.', 'Ang pangngalan ay ngalan ng hayop, tao, lugar, o bagay. Ngayon ay kikilalanin natin ang apat na kaibigang hayop: pusa, aso, ibon, at isda.'),
  ('A cat has whiskers. A dog can bark. A bird has feathers. A fish lives in water. Say each animal name slowly.', 'May bigote ang pusa. Maaaring tumahol ang aso. May balahibo ang ibon. Nakatira sa tubig ang isda. Dahan-dahang sabihin ang pangalan ng bawat hayop.'),
  ('Read: The bird is in the tree. Bird names the animal. Tree names the place where the bird is resting. Point to an animal in the picture and name it.', 'Basahin: Nasa puno ang ibon. Ibon ang ngalan ng hayop. Puno ang ngalan ng bagay na pinagpapahingahan nito. Ituro ang isang hayop sa larawan at pangalanan ito.'),
  ('Try it: Say a sentence about a cat or a dog. Start with The cat or The dog. Then tell what your animal does. You are ready for the animal quiz and word game!', 'Subukan: Magsabi ng pangungusap tungkol sa pusa o aso. Magsimula sa Ang pusa o Ang aso. Pagkatapos, sabihin ang ginagawa nito. Handa ka na para sa pagsusulit at laro!')],
 [('cat','pusa'),('dog','aso'),('bird','ibon'),('fish','isda')],
 [('Which word names an animal?', ['cat','jump','blue','kind']), ('Which animal has feathers?', ['bird','fish','dog','cat'])]),
(1, 'Colors in the garden', 8,
 [('Color words tell us what something looks like. Red, blue, yellow, and green are color words. Look for these colors in the garden picture.', 'Sinasabi ng mga salitang pangkulay ang hitsura ng isang bagay. Pula, asul, dilaw, at berde ang ilan sa mga kulay. Hanapin ang mga kulay na ito sa larawan ng hardin.'),
  ('A ripe tomato can be red. The clear daytime sky can look blue. A sunflower can be yellow. A healthy leaf is often green.', 'Maaaring pula ang hinog na kamatis. Maaaring asul ang maaliwalas na langit sa araw. Maaaring dilaw ang mirasol. Madalas ay berde ang malusog na dahon.'),
  ('Read: Milo sees a yellow flower. Yellow describes the flower. We can use a color word before a thing: red ball, blue bag, green leaf.', 'Basahin: Nakakita si Milo ng dilaw na bulaklak. Inilalarawan ng dilaw ang bulaklak. Maaari tayong gumamit ng kulay bago ang isang bagay: pulang bola, asul na bag, berdeng dahon.'),
  ('Try it: Find three safe things near you. Name each thing and its color. Colors help us describe what we see. Now practice the four garden colors.', 'Subukan: Humanap ng tatlong ligtas na bagay sa paligid. Sabihin ang ngalan at kulay ng bawat isa. Nakakatulong ang kulay upang ilarawan ang nakikita. Magsanay sa apat na kulay ng hardin.')],
 [('red','pula'),('blue','asul'),('yellow','dilaw'),('green','berde')],
 [('In yellow flower, which word tells the color?', ['yellow','flower','garden','Milo']), ('Which phrase includes a color word?', ['green leaf','small rabbit','happy child','three books'])]),
(1, 'Kind words every day', 12,
 [('Kind words help people feel welcome. Say hello when you greet someone. Say please when asking politely. Say thank you when someone helps you.', 'Nakakatulong ang magagalang na salita upang maging magaan ang pakikitungo. Magsabi ng kumusta sa pagbati. Gumamit ng pakiusap kapag may hinihiling. Magsabi ng salamat kapag may tumulong.'),
  ('If you bump into someone by accident, say sorry and check that they are okay. Words are kind when our actions are kind too.', 'Kapag hindi sinasadyang nakabangga, humingi ng paumanhin at tiyaking ayos ang nabangga. Nagiging magalang ang salita kapag magalang din ang kilos.'),
  ('Read: May I borrow your book, please? Luna gives Finn a book. Finn says, Thank you! Finn asks before borrowing and thanks his friend afterward.', 'Basahin: Maaari ko bang hiramin ang aklat mo? Ibinigay ni Luna kay Finn ang aklat. Sinabi ni Finn, Salamat! Nagpaalam si Finn bago humiram at nagpasalamat pagkatapos.'),
  ('Try it: Practice greeting a friend, asking for a turn, and thanking a helper. Use a calm voice. You can practice these words with a trusted adult.', 'Subukan: Magsanay sa pagbati, paghingi ng pagkakataon, at pagpapasalamat. Gumamit ng mahinahong boses. Maaari kang magsanay kasama ang pinagkakatiwalaang nakatatanda.')],
 [('hello','kumusta'),('please','pakiusap'),('thank you','salamat'),('sorry','paumanhin')],
 [('A friend shares a pencil. What can you say?', ['Thank you!','Go away!','That is mine!','Hurry up!']), ('What should you do before borrowing a book?', ['Ask politely.','Hide it.','Take it without asking.','Tear a page.'])]),
(2, 'Action words on the playground', 0,
 [('An action word, or verb, tells what someone does. Run, jump, read, and write are action words. Look for the action in each sentence.', 'Sinasabi ng pandiwa ang kilos na ginagawa. Ang tumakbo, tumalon, bumasa, at sumulat ay mga salitang kilos. Hanapin ang kilos sa bawat pangungusap.'),
  ('Read: The rabbit jumps. The owl reads. Jumps and reads tell what the animals do. In a sentence, an action word works with the person or animal doing it.', 'Basahin: Tumatalon ang kuneho. Bumabasa ang kuwago. Sinasabi ng tumatalon at bumabasa ang kilos ng mga hayop. Kasama ng pandiwa ang gumagawa ng kilos sa pangungusap.'),
  ('The children write in their notebooks. Who does the action? The children. What do they do? They write. Notice that notebooks names a thing, while write names an action.', 'Sumusulat ang mga bata sa kanilang kuwaderno. Sino ang gumagawa? Ang mga bata. Ano ang ginagawa nila? Sumusulat sila. Bagay ang kuwaderno, samantalang kilos ang sumulat.'),
  ('Try it: Tell two actions you can do safely. Make one sentence for each action. Then find action words in the quiz. You do not need to act out running indoors.', 'Subukan: Magbanggit ng dalawang ligtas na kilos na kaya mong gawin. Gumawa ng pangungusap para sa bawat isa. Hanapin ang mga pandiwa sa pagsusulit. Hindi kailangang tumakbo sa loob ng bahay.')],
 [('run','tumakbo'),('jump','tumalon'),('read','bumasa'),('write','sumulat')],
 [('In The rabbit jumps, which word is an action?', ['jumps','rabbit','the','animal']), ('Which sentence tells an action?', ['The owl reads a book.','The book is blue.','The owl is small.','The sky is clear.'])]),
(2, 'Where is the little turtle?', 1,
 [('Position words tell where something is. In, on, under, and beside help us describe a place. Imagine a turtle near a toy box.', 'Sinasabi ng mga salitang panlunan kung nasaan ang isang bagay. Sa loob, sa ibabaw, sa ilalim, at sa tabi ang ilang halimbawa. Isipin ang pagong na malapit sa kahon ng laruan.'),
  ('A ball in the box is inside it. A book on the box rests on top. A cat under the table is below it. A bag beside the chair is next to it.', 'Nasa loob ng kahon ang bolang nakalagay dito. Nasa ibabaw ang aklat na nakapatong sa kahon. Nasa ilalim ng mesa ang pusang nasa ibaba nito. Nasa tabi ng upuan ang bag na katabi nito.'),
  ('Read: Tali rests under a tree. Under tells where Tali rests. If Tali moves beside the tree, the position changes even though the tree stays in the same place.', 'Basahin: Nagpapahinga si Tali sa ilalim ng puno. Sinasabi ng sa ilalim kung nasaan si Tali. Kapag lumipat siya sa tabi ng puno, nagbabago ang kaniyang puwesto kahit hindi gumalaw ang puno.'),
  ('Try it: Put a pencil beside a book. Tell where the pencil is. Move it onto the book and describe the new position. Ask an adult before moving large objects.', 'Subukan: Ilagay ang lapis sa tabi ng aklat. Sabihin kung nasaan ito. Ipatong ito sa aklat at ilarawan ang bagong puwesto. Magpaalam sa nakatatanda bago maglipat ng mabibigat na bagay.')],
 [('in','sa loob'),('on','sa ibabaw'),('under','sa ilalim'),('beside','sa tabi')],
 [('A bag is next to a chair. Which word describes its position?', ['beside','under','inside','above']), ('In The cat sleeps under the table, where is the cat?', ['below the table','on top of the table','inside a box','beside a tree'])]),
(2, 'Complete sentences with Luna', 12,
 [('A complete sentence shares a complete thought. It tells who or what we are talking about and says something about that person or thing.', 'Nagpapahayag ng buong diwa ang pangungusap. Sinasabi nito kung sino o ano ang pinag-uusapan at may sinasabi tungkol dito.'),
  ('Read: Luna reads a book. This is a complete thought. Luna tells who. Reads a book tells what she does. A sentence begins with a capital letter.', 'Basahin: Bumabasa ng aklat si Luna. Buo ang diwa nito. Si Luna ang pinag-uusapan. Bumabasa ng aklat ang sinasabi tungkol sa kaniya. Nagsisimula ang pangungusap sa malaking titik.'),
  ('A statement usually ends with a period. A question ends with a question mark. A word group such as the little owl does not yet tell a complete thought.', 'Karaniwang nagtatapos sa tuldok ang pasalaysay. Nagtatapos sa tandang pananong ang tanong. Hindi pa buo ang diwa ng pangkat ng salitang ang munting kuwago.'),
  ('Try it: Finish this thought: The rabbit ___. You might say The rabbit jumps. Check the capital letter and ending mark. Read your sentence aloud.', 'Subukan: Kumpletuhin: Ang kuneho ay ___. Maaaring sabihin, Ang kuneho ay tumatalon. Suriin ang malaking titik at bantas sa hulihan. Basahin nang malakas ang pangungusap.')],
 [('sentence','pangungusap'),('word','salita'),('period','tuldok'),('question','tanong')],
 [('Which is a complete sentence?', ['The owl reads.','The little owl','A purple book','Under the tree']), ('Which mark ends a direct question?', ['question mark','comma','period only','apostrophe'])]),
(3, 'Describe our animal friends', 8,
 [('An adjective describes a noun. It can tell size, color, shape, or a quality. In a gentle turtle, gentle describes turtle.', 'Inilalarawan ng pang-uri ang pangngalan. Maaari nitong sabihin ang laki, kulay, hugis, o katangian. Sa mahinahong pagong, inilalarawan ng mahinahon ang pagong.'),
  ('Read: The small rabbit carries a bright basket. Small describes rabbit. Bright describes basket. Describing words help a reader imagine a scene.', 'Basahin: May dalang matingkad na basket ang maliit na kuneho. Inilalarawan ng maliit ang kuneho. Inilalarawan ng matingkad ang basket. Nakakatulong ang pang-uri upang maisip ng mambabasa ang tagpo.'),
  ('A kind friend shares a turn. A brave helper asks an adult for help when needed. Kind and brave describe qualities rather than colors or sizes.', 'Nagbabahagi ng pagkakataon ang mabait na kaibigan. Humihingi ng tulong sa nakatatanda ang matapang na katulong kapag kailangan. Katangian ang inilalarawan ng mabait at matapang.'),
  ('Try it: Choose one animal. Describe it with two adjectives and use the words in a complete sentence. Be specific: a small green turtle is clearer than a nice thing.', 'Subukan: Pumili ng hayop. Ilarawan ito gamit ang dalawang pang-uri at gamitin sa buong pangungusap. Maging tiyak: mas malinaw ang maliit na berdeng pagong kaysa magandang bagay.')],
 [('small','maliit'),('bright','matingkad'),('kind','mabait'),('brave','matapang')],
 [('In a small green turtle, which words describe the turtle?', ['small and green','a and turtle','turtle only','a only']), ('Which word describes a quality?', ['kind','basket','walk','garden'])]),
(3, 'One and many in the library', 15,
 [('Singular means one. Plural means more than one. In English, many plural nouns are formed by adding s: book becomes books, and cat becomes cats.', 'Ang isahan ay tumutukoy sa isa. Ang maramihan ay higit sa isa. Sa English, maraming pangngalang maramihan ang nilalagyan ng s: book ay nagiging books at cat ay nagiging cats.'),
  ('Some words add es, such as box becoming boxes. Some change their spelling, such as child becoming children. Read the word carefully rather than adding s to every noun.', 'May mga salitang nilalagyan ng es, gaya ng box na nagiging boxes. May mga nagbabago ng baybay, gaya ng child na nagiging children. Basahing mabuti ang salita sa halip na laging magdagdag ng s.'),
  ('Read: One child brings two books. Child tells about one person. Books tells about more than one book. In Filipino, mga often helps show more than one: mga aklat.', 'Basahin: May dalang dalawang aklat ang isang bata. Isang tao ang tinutukoy ng child. Higit sa isang aklat ang tinutukoy ng books. Sa Filipino, nakakatulong ang mga upang magpahiwatig ng maramihan: mga aklat.'),
  ('Try it: Write the plural of book, box, and child. Use one plural noun in a sentence. Check whether the number word and the noun agree.', 'Subukan: Isulat ang maramihan ng book, box, at child. Gumamit ng isang pangngalang maramihan sa pangungusap. Suriin kung tugma ang bilang at ang pangngalan.')],
 [('book','aklat'),('books','mga aklat'),('child','bata'),('children','mga bata')],
 [('Which is the correct plural of box?', ['boxes','boxs','boxies','boxen']), ('Which sentence uses the plural correctly?', ['Two children read books.','Two child read books.','Two childs read book.','Two childrens read book.'])]),
(3, 'First, next, and last', 9,
 [('Sequence is the order in which events happen. Words such as first, next, then, and finally help readers follow instructions and stories.', 'Ang pagkakasunod-sunod ay ang ayos ng mga pangyayari. Nakakatulong ang una, kasunod, pagkatapos, at sa huli upang masundan ang panuto at kuwento.'),
  ('First, Milo puts soil in a pot. Next, he plants a seed. Then, he waters the soil gently. Finally, he puts the pot in a suitable sunny place.', 'Una, naglagay si Milo ng lupa sa paso. Kasunod, nagtanim siya ng binhi. Pagkatapos, marahan niyang diniligan ang lupa. Sa huli, inilagay niya ang paso sa angkop na maaraw na lugar.'),
  ('Changing the order can change the result. Planting a seed before there is soil will not work well. Look for clues that tell which step must happen before another.', 'Maaaring magbago ang resulta kapag binago ang ayos. Hindi maayos ang pagtatanim ng binhi kung wala pang lupa. Hanapin ang mga palatandaang nagsasabi kung aling hakbang ang kailangang mauna.'),
  ('Try it: Explain how you prepare a book for reading. Use first, next, and finally. Make each step clear enough for a friend to follow.', 'Subukan: Ipaliwanag kung paano ka naghahanda ng aklat para bumasa. Gamitin ang una, kasunod, at sa huli. Gawing malinaw ang bawat hakbang upang masundan ng kaibigan.')],
 [('first','una'),('next','kasunod'),('then','pagkatapos'),('finally','sa huli')],
 [('What does Milo do immediately after planting the seed?', ['He waters the soil.','He adds the first soil.','He harvests tomatoes.','He removes the pot.']), ('Which word usually signals the last step?', ['finally','first','before','next'])]),
(4, 'Yesterday, today, and tomorrow', 0,
 [('Verb tense helps show when an action happens. A simple past action happened before now. A simple present action can tell a habit. A future action will happen later.', 'Nakakatulong ang panahunan ng pandiwa upang ipakita kung kailan nangyayari ang kilos. Naganap na ang kilos sa nakaraan. Maaaring ipakita ng kasalukuyan ang nakagawian. Magaganap pa ang kilos sa hinaharap.'),
  ('Read: Finn walked yesterday. Finn walks every morning. Finn will walk tomorrow. Walked shows the past, walks shows a present habit, and will walk shows the future.', 'Basahin: Naglakad si Finn kahapon. Naglalakad si Finn tuwing umaga. Maglalakad si Finn bukas. Ipinapakita ng mga pandiwa ang nakaraan, nakagawiang kilos, at hinaharap.'),
  ('Time clues help you choose a verb. Yesterday and last week point to the past. Every day can point to a habit. Tomorrow and next week point to the future. Some past forms are irregular: go becomes went.', 'Nakakatulong ang mga pahiwatig ng oras sa pagpili ng pandiwa. Nakaraan ang kahapon at nakaraang linggo. Nakagawiang kilos ang maaaring tukuyin ng araw-araw. Hinaharap ang bukas at susunod na linggo. May di-karaniwang anyo: go ay nagiging went.'),
  ('Try it: Complete three sentences about reading: Yesterday I ___. Every day I ___. Tomorrow I will ___. Use the time clue to check each verb.', 'Subukan: Kumpletuhin ang tatlong pangungusap tungkol sa pagbasa: Kahapon ay ___. Araw-araw ay ___. Bukas ay ___. Gamitin ang pahiwatig ng oras upang suriin ang pandiwa.')],
 [('yesterday','kahapon'),('today','ngayon'),('tomorrow','bukas'),('every day','araw-araw')],
 [('Choose the correct verb: Yesterday, Finn ___ to school.', ['walked','walks','will walk','walking']), ('Which sentence tells a future action?', ['Luna will read tomorrow.','Luna read yesterday.','Luna reads every night.','Luna is reading now.'])]),
(4, 'Why the garden grew', 10,
 [('A cause tells why something happens. An effect tells what happens as a result. Connecting these ideas helps us explain events rather than only list them.', 'Sinasabi ng sanhi kung bakit nangyayari ang isang bagay. Sinasabi ng bunga ang resulta. Nakakatulong ang pag-uugnay sa mga ito upang maipaliwanag ang mga pangyayari sa halip na ilista lamang.'),
  ('Read: The soil was dry, so Milo watered the garden. The dry soil is the cause of his decision. Watering the garden is the effect. The word so often introduces a result.', 'Basahin: Tuyo ang lupa kaya diniligan ni Milo ang hardin. Ang tuyong lupa ang sanhi ng kaniyang pasiya. Ang pagdidilig ang bunga. Madalas ipakilala ng kaya ang resulta.'),
  ('Read: The path became wet because rain fell. Rain falling is the cause even though it appears later in the sentence. Because helps explain why. Word order alone does not identify cause and effect.', 'Basahin: Nabasa ang daan dahil umulan. Ang pag-ulan ang sanhi kahit nasa hulihan ito ng pangungusap. Ipinapaliwanag ng dahil ang dahilan. Hindi sapat ang ayos ng salita lamang upang matukoy ang sanhi at bunga.'),
  ('Try it: Explain why you carry an umbrella on a rainy day. Name the cause and effect. Use because or so, and make sure the connection is reasonable.', 'Subukan: Ipaliwanag kung bakit nagdadala ka ng payong sa maulang araw. Tukuyin ang sanhi at bunga. Gamitin ang dahil o kaya at tiyaking makatuwiran ang ugnayan.')],
 [('cause','sanhi'),('effect','bunga'),('because','dahil'),('result','resulta')],
 [('Rain fell, so the path became wet. What is the cause?', ['Rain fell.','The path became wet.','The sun rose.','Milo read a book.']), ('Which sentence gives a reasonable cause and effect?', ['The plant lacked water, so its leaves wilted.','The book was purple, so the sea became salty.','The turtle smiled, so yesterday became tomorrow.','The pot was round, so all birds stopped flying.'])]),
(4, 'Compare the forest and the reef', 4,
 [('To compare is to find similarities. To contrast is to find differences. Read both things carefully before deciding what they share and what makes each different.', 'Ang paghahambing ay pagtingin sa pagkakatulad. Ang pagtukoy sa kaibahan ay pagtingin sa pagkakaiba. Basahing mabuti ang dalawang bagay bago magpasiya kung ano ang magkatulad at naiiba.'),
  ('A forest has trees and many land animals. A reef is underwater and shelters many sea animals. Both are habitats where living things find what they need.', 'May mga puno at maraming hayop sa lupa sa kagubatan. Nasa ilalim ng dagat ang bahura at kanlungan ito ng mga hayop-dagat. Pareho silang tirahang pinagkukunan ng kailangan ng mga nilalang.'),
  ('Use both or similarly for a similarity. Use unlike or however for a difference. Both Finn and Ollie help friends. Unlike Finn, Ollie lives in the ocean.', 'Gamitin ang pareho o gayundin para sa pagkakatulad. Gamitin ang di-tulad o subalit para sa kaibahan. Parehong tumutulong sa kaibigan sina Finn at Ollie. Di-tulad ni Finn, nasa dagat si Ollie.'),
  ('Try it: Compare a storybook and a dictionary. Give one similarity and one difference. Support each idea by naming a feature of the two books.', 'Subukan: Ihambing ang aklat ng kuwento at diksiyonaryo. Magbigay ng isang pagkakatulad at isang pagkakaiba. Suportahan ang bawat ideya gamit ang katangian ng dalawang aklat.')],
 [('similar','magkatulad'),('different','magkaiba'),('both','pareho'),('habitat','tirahan')],
 [('What do a forest and a reef have in common?', ['Both are habitats.','Both are always dry.','Both have only land animals.','Both are above the clouds.']), ('Which sentence contrasts Finn and Ollie?', ['Finn lives on land, while Ollie lives in the ocean.','Both help their friends.','Both can be kind.','Both appear in stories.'])]),
(5, 'Find the main idea', 15,
 [('The main idea is what a paragraph is mostly about. Supporting details explain or give examples of that idea. A title or topic sentence can help, but read the whole paragraph.', 'Ang pangunahing ideya ang pinakabuod ng talata. Nagpapaliwanag o nagbibigay ng halimbawa ang mga pantulong na detalye. Maaaring makatulong ang pamagat o paksang pangungusap, ngunit basahin ang buong talata.'),
  ('Read: Luna keeps the library welcoming. She arranges cushions, labels the shelves, and helps new readers choose books. Each detail shows how Luna makes the library welcoming.', 'Basahin: Pinananatiling magiliw ni Luna ang aklatan. Inaayos niya ang mga unan, nilalagyan ng tanda ang mga istante, at tinutulungan ang bagong mambabasa na pumili ng aklat. Ipinapakita ng bawat detalye ang magiliw na aklatan.'),
  ('The paragraph is mostly about making the library welcoming. It is not mostly about cushions alone. A main idea should include the important details without becoming so broad that it says almost nothing.', 'Tungkol sa pagiging magiliw ng aklatan ang talata. Hindi lamang tungkol sa mga unan ang paksa. Dapat masaklaw ng pangunahing ideya ang mahahalagang detalye nang hindi nagiging sobrang malawak o malabo.'),
  ('Try it: Write a one-sentence main idea for the paragraph. Then list two supporting details. Ask whether each detail helps explain your main idea.', 'Subukan: Isulat sa isang pangungusap ang pangunahing ideya ng talata. Maglista ng dalawang pantulong na detalye. Suriin kung nakakatulong ang bawat detalye sa pagpapaliwanag ng pangunahing ideya.')],
 [('main idea','pangunahing ideya'),('detail','detalye'),('paragraph','talata'),('title','pamagat')],
 [('What is the library paragraph mostly about?', ['Luna makes the library welcoming.','Cushions are always purple.','All books are new.','Luna dislikes reading.']), ('Which detail supports the main idea?', ['She helps new readers choose books.','The ocean has coral.','Finn likes apples.','Some turtles swim.'])]),
(5, 'Use context clues', 5,
 [('Context clues are nearby words and ideas that help explain an unfamiliar word. Look for a definition, example, contrast, or explanation before guessing a meaning.', 'Ang mga pahiwatig sa konteksto ay mga kalapit na salita at ideyang nagpapaliwanag sa di-pamilyar na salita. Humanap ng kahulugan, halimbawa, kaibahan, o paliwanag bago hulaan ang ibig sabihin.'),
  ('Read: The reef was pristine, clean and free of litter. The words clean and free of litter explain pristine. We can use the explanation as evidence for the meaning.', 'Basahin: Malinis at walang kalat ang pristine na bahura. Ipinapaliwanag ng malinis at walang kalat ang pristine. Maaaring gawing batayan ang paliwanag upang maunawaan ang kahulugan.'),
  ('Read: Pip was timid at first, but later he greeted everyone with confidence. The contrast between timid and confidence suggests that timid means shy, not loud or fearless.', 'Basahin: Timid si Pip noong una, ngunit kalaunan ay bumati siya nang may kumpiyansa. Ipinapahiwatig ng kaibahan ng timid at kumpiyansa na mahiyain ang ibig sabihin nito, hindi maingay o walang takot.'),
  ('Try it: Underline the clue that helps explain pristine. Then explain timid using the contrast in the second example. Check a dictionary when the clues are not enough.', 'Subukan: Salungguhitan ang pahiwatig na nagpapaliwanag sa pristine. Ipaliwanag naman ang timid gamit ang kaibahan sa ikalawang halimbawa. Gumamit ng diksiyonaryo kapag kulang ang mga pahiwatig.')],
 [('pristine','malinis at di-nadungisan'),('timid','mahiyain'),('clue','pahiwatig'),('confidence','kumpiyansa')],
 [('The reef was pristine, clean and free of litter. What explains pristine?', ['clean and free of litter','the word reef alone','the time of day','the number of fish']), ('Pip was timid, but later greeted everyone with confidence. Timid most likely means what?', ['shy','fearless','noisy','angry'])]),
(5, 'Read between the lines', 14,
 [('An inference is a conclusion based on clues and what you already know. It is more than a guess. Explain which clues support your conclusion.', 'Ang paghihinuha ay konklusyong batay sa pahiwatig at dati nang kaalaman. Higit ito sa basta hula. Ipaliwanag kung aling mga pahiwatig ang sumusuporta sa konklusyon.'),
  ('Read: Pip shivered and pulled his scarf close. Luna brought a warm blanket. The story does not directly say Pip felt cold, but shivering and the blanket support that inference.', 'Basahin: Nanginig si Pip at hinigpitan ang bandana. Nagdala si Luna ng mainit na kumot. Hindi tuwirang sinabi na nilalamig si Pip, ngunit sinusuportahan ito ng panginginig at kumot.'),
  ('A good inference fits the clues. We cannot conclude that Pip hates books from this passage because there is no supporting evidence. If new clues appear, we may need to revise an inference.', 'Tugma sa mga pahiwatig ang mahusay na hinuha. Hindi natin masasabing ayaw ni Pip sa aklat dahil walang ebidensiya nito sa talata. Maaaring baguhin ang hinuha kapag may bagong pahiwatig.'),
  ('Try it: Explain what Pip probably needs and name two clues. Use this pattern: I infer ___ because ___. Keep your conclusion connected to the text.', 'Subukan: Ipaliwanag kung ano ang malamang na kailangan ni Pip at magbanggit ng dalawang pahiwatig. Gamitin: Nahihinuha kong ___ dahil ___. Iugnay ang konklusyon sa teksto.')],
 [('inference','hinuha'),('evidence','ebidensiya'),('conclusion','konklusyon'),('revise','baguhin')],
 [('What can you infer from Pip shivering and receiving a blanket?', ['Pip feels cold.','Pip hates books.','Pip is underwater.','Pip wants to run a race.']), ('Which is the strongest reason for an inference?', ['Clues in the text support it.','It is the most surprising answer.','A friend guessed it.','It has the longest words.'])]),
(6, 'Fact, opinion, and reliable evidence', 4,
 [('A fact can be checked with reliable evidence. An opinion expresses a belief, preference, or judgment. An opinion can be thoughtful, but it is not proven simply because someone states it confidently.', 'Masusuri gamit ang maaasahang ebidensiya ang katotohanan. Nagpapahayag ng paniniwala, kagustuhan, o paghatol ang opinyon. Maaaring makabuluhan ang opinyon, ngunit hindi ito napapatunayan dahil lamang sa tiwalang pagkakasabi.'),
  ('Read: An octopus has eight arms. This is a claim we can verify with a reliable reference. Purple is the prettiest color is an opinion because prettiest depends on a person’s preference.', 'Basahin: May walong galamay ang pugita. Pahayag itong maaaring tiyakin sa maaasahang sanggunian. Opinyon ang Pinakamaganda ang lila dahil nakabatay sa kagustuhan ng tao ang pinakamaganda.'),
  ('A checkable claim may still be false, so verify it. Consider who created a source, the evidence it gives, and whether other reliable sources agree. A large number of likes is not proof.', 'Maaaring mali pa rin ang isang nasusuring pahayag kaya tiyakin ito. Isaalang-alang ang gumawa ng sanggunian, ebidensiyang ibinigay, at pagsang-ayon ng iba pang maaasahang sanggunian. Hindi patunay ang dami ng likes.'),
  ('Try it: Write one checkable statement and one opinion about animals. Explain how you would verify the statement. Ask a trusted adult before opening unfamiliar websites.', 'Subukan: Sumulat ng isang nasusuring pahayag at isang opinyon tungkol sa hayop. Ipaliwanag kung paano titiyakin ang pahayag. Humingi ng tulong sa nakatatanda bago bumukas ng di-pamilyar na website.')],
 [('fact','katotohanan'),('opinion','opinyon'),('reliable','maaasahan'),('source','sanggunian')],
 [('Which statement is an opinion?', ['Purple is the prettiest color.','An octopus has eight arms.','A week has seven days.','A triangle has three sides.']), ('What is the best way to check an animal claim?', ['Consult a reliable reference and its evidence.','Count its likes online.','Trust the largest font.','Choose the funniest explanation.'])]),
(6, 'Build a claim with reasons', 6,
 [('A claim is an idea you want readers to accept. Reasons explain why the claim makes sense. Evidence supports those reasons with facts, observations, or trustworthy information.', 'Ang paninindigan ay ideyang nais mong tanggapin ng mambabasa. Ipinapaliwanag ng mga dahilan kung bakit ito makatuwiran. Sinusuportahan ng ebidensiya ang dahilan gamit ang katotohanan, obserbasyon, o mapagkakatiwalaang impormasyon.'),
  ('Claim: Our class should reduce litter. Reason: Litter can harm animals. Evidence: During the class cleanup, volunteers counted twenty pieces of plastic beside the pond. The observation supports a local need for action.', 'Paninindigan: Dapat bawasan ng klase ang kalat. Dahilan: Maaaring makapinsala sa hayop ang kalat. Ebidensiya: Sa paglilinis ng klase, nakabilang ang mga boluntaryo ng dalawampung plastik sa tabi ng lawa. Sinusuportahan ng obserbasyon ang pangangailangan ng pagkilos.'),
  ('A reason must relate to the claim. The library has purple cushions does not explain why we should reduce pond litter. Consider other viewpoints respectfully, and avoid pretending one observation proves every possible case.', 'Dapat kaugnay ng paninindigan ang dahilan. Hindi naipapaliwanag ng mga lilang unan sa aklatan kung bakit dapat bawasan ang kalat sa lawa. Igalang ang ibang pananaw at huwag ipagpalagay na pinatutunayan ng isang obserbasyon ang lahat ng sitwasyon.'),
  ('Try it: Make a claim about caring for a shared place. Give a relevant reason and describe evidence you could collect safely with an adult. Separate what you observed from what you believe.', 'Subukan: Magbigay ng paninindigan tungkol sa pangangalaga sa lugar na ginagamit ng marami. Magbigay ng kaugnay na dahilan at ebidensiyang ligtas na makakalap kasama ang nakatatanda. Ihiwalay ang napagmasdan sa pinaniniwalaan.')],
 [('claim','paninindigan'),('reason','dahilan'),('observation','obserbasyon'),('viewpoint','pananaw')],
 [('Which evidence best supports reducing litter near the pond?', ['Volunteers counted plastic beside the pond.','The library has purple cushions.','Finn prefers apples.','The classroom clock is round.']), ('Which part explains why a claim makes sense?', ['a relevant reason','an unrelated joke','a decorative title','a random number'])]),
(6, 'Figurative language and careful meaning', 13,
 [('Figurative language creates a picture beyond a word’s literal meaning. A simile compares using like or as. A metaphor describes one thing as another to suggest a shared quality.', 'Lumilikha ang matalinghagang wika ng larawang higit sa literal na kahulugan. Gumagamit ng tulad o parang ang pagtutulad. Inilalarawan naman ng pagwawangis ang isang bagay bilang iba upang ipakita ang magkaparehong katangian.'),
  ('Read: The fireflies shone like tiny lanterns. This simile compares their light to lanterns. Read: The library was a warm hug. This metaphor suggests comfort; the building does not have arms.', 'Basahin: Kuminang ang mga alitaptap na parang munting parol. Inihahambing ng pagtutulad ang liwanag nila sa parol. Basahin: Isang mainit na yakap ang aklatan. Ipinapahiwatig ng pagwawangis ang ginhawa; walang mga bisig ang gusali.'),
  ('Personification gives human actions or qualities to something nonhuman: The wind whispered through the leaves. Wind does not literally speak. Use the context to explain the effect on the reader.', 'Nagbibigay ng kilos o katangiang pantao sa hindi tao ang pagsasatao: Bumulong ang hangin sa mga dahon. Hindi literal na nagsasalita ang hangin. Gamitin ang konteksto upang ipaliwanag ang epekto sa mambabasa.'),
  ('Try it: Write a simile about moonlight and a metaphor about friendship. Explain each comparison in plain language. Make sure you can distinguish an imaginative description from a factual claim.', 'Subukan: Sumulat ng pagtutulad tungkol sa liwanag ng buwan at pagwawangis tungkol sa pagkakaibigan. Ipaliwanag ang bawat paghahambing sa payak na salita. Ihiwalay ang malikhaing paglalarawan sa makatotohanang pahayag.')],
 [('simile','pagtutulad'),('metaphor','pagwawangis'),('personification','pagsasatao'),('literal','tuwiran')],
 [('Which sentence is a simile?', ['The fireflies shone like tiny lanterns.','The fireflies have wings.','The library opens at nine.','Pip has a red scarf.']), ('What does The library was a warm hug suggest?', ['The library felt comforting.','The building grew arms.','Every book was hot.','The library could walk.'])]),
]

def uid(value):
    return str(uuid5(NAMESPACE_URL, 'https://linguakids.local/grade-pathways/v3/' + value))

def build():
    materials, keys = [], {}
    for index, (grade, title, scene, pages, pairs, skills) in enumerate(UNITS):
        level = 'beginner' if grade <= 2 else 'developing' if grade <= 4 else 'independent'
        base = f'{grade}/{index}'
        for kind in ('lesson', 'quiz', 'game'):
            identifier = uid(base + '/' + kind)
            body = {'cover_scene': scene, 'unit_title': title}
            if kind == 'lesson':
                body['pages'] = [{'english': en, 'filipino': fil, 'scene': scene} for en, fil in pages]
            elif kind == 'game':
                body['pairs'] = [{'en': en, 'fil': fil} for en, fil in pairs]
            else:
                questions = [(f'Which Filipino word or phrase means "{en}"?', [fil] + [p[1] for p in pairs if p[1] != fil]) for en, fil in pairs] + skills
                body['questions'] = []
                key = {}
                for n, (prompt, choices) in enumerate(questions):
                    qid = uid(base + f'/q{n}')
                    correct = choices[0]
                    shift = (n + grade) % 4
                    rotated = choices[shift:] + choices[:shift]
                    options = [{'id': uid(base + f'/q{n}/{a}'), 'text': a} for a in rotated]
                    body['questions'].append({'id': qid, 'prompt': prompt, 'options': options})
                    key[qid] = next(o['id'] for o in options if o['text'] == correct)
                keys[identifier] = key
            materials.append({'id': identifier, 'owner_id': None, 'kind': kind, 'title': f'Grade {grade}: {title}' + {'lesson':'', 'quiz':' — Quiz', 'game':' — Word game'}[kind], 'grade_level': grade, 'learning_level': level, 'summary': {'lesson':'Four bilingual learning pages with examples and a practice task.', 'quiz':'Six questions: vocabulary and applying the lesson. Tap A, B, C, or D.', 'game':'Match four lesson words with their Filipino meanings.'}[kind], 'source_label': SOURCE, 'body': body, 'status': 'published', 'version': 1})
    return materials, keys

def write_outputs(path):
    materials, keys = build()
    (APP/'assets/content/grade_collection.json').write_text(json.dumps({'materials': materials}, ensure_ascii=False, indent=2), encoding='utf-8')
    (APP/'lib/preview/grade_collection_data.dart').write_text('// Preview only. Never imported by the connected app.\n' + "const gradePreviewMaterialsJson = r'''" + json.dumps(materials, ensure_ascii=False) + "''';\nconst gradePreviewAnswerKeysJson = r'''" + json.dumps(keys, ensure_ascii=False) + "''';\n", encoding='utf-8')
    payload = [{**m, 'answer_key': keys.get(m['id'], {})} for m in materials]
    sql = '''-- Additive original grade pathways. No account or previous-content changes.
do $collection$
declare item jsonb; changed integer:=0;
begin
  for item in select value from jsonb_array_elements($grade_data$''' + json.dumps(payload, ensure_ascii=False) + '''$grade_data$::jsonb) loop
    if exists(select 1 from public.learning_materials where id=(item->>'id')::uuid and source_label<>item->>'source_label') then raise exception 'Reserved collection identifier is already used'; end if;
    insert into public.learning_materials(id,owner_id,kind,title,grade_level,learning_level,summary,source_label,body,status,version)
    values((item->>'id')::uuid,null,item->>'kind',item->>'title',(item->>'grade_level')::smallint,item->>'learning_level',item->>'summary',item->>'source_label',item->'body','published',1)
    on conflict(id) do nothing;
    if found then changed:=changed+1; end if;
    if item->>'kind'='quiz' then
      insert into private.material_answers(material_id,answers) values((item->>'id')::uuid,item->'answer_key') on conflict(material_id) do nothing;
    end if;
  end loop;
  if changed>0 then insert into public.audit_logs(action,entity_type,metadata) values('grade_pathways_installed','learning_material',jsonb_build_object('materials',changed,'source','original grade enrichment v3'));end if;
end $collection$;
'''
    path.write_text(sql, encoding='utf-8')
    print(f'Created {len(materials)} distinct activities: 18 four-page lessons, 18 six-question quizzes, 18 word games.')

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--migration', type=Path, required=True)
    write_outputs(parser.parse_args().migration)

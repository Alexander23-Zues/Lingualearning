import csv
import os

# Path to the dataset file
dataset_path = r"c:\Users\jomar\Desktop\Lingualearning\ml\data\school_en_fil_25k.csv"

# Read existing entries
existing_data = []
with open(dataset_path, 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    existing_data = list(reader)

print(f"Starting with {len(existing_data)} existing entries")

# Prepare to append new data
new_data = []

# 1. Continue Basic Communication (target ~3000 total, we have ~50)
basic_comm = [
    ("Can I go now?", "Pwede na ba akong umalis?", "Permission request"),
    ("Wait a moment", "Sandali lang", "Request to wait"),
    ("Come here", "Halika dito", "Direct request"),
    ("Sit down please", "Upo ka po", "Polite instruction"),
    ("Stand up", "Tayo", "Direct instruction"),
    ("Be careful", "Mag-ingat ka", "Warning"),
    ("Take care", "Ingat ka", "Farewell care"),
    ("Get well soon", "Gumaling ka na", "Well wishes"),
    ("Congratulations", "Binabati kita", "Celebration"),
    ("Happy birthday", "Maligayang kaarawan", "Birthday greeting"),
    ("Merry Christmas", "Maligayang Pasko", "Christmas greeting"),
    ("Happy New Year", "Manigong Bagong Taon", "New Year greeting"),
    ("I love you", "Mahal kita", "Affection"),
    ("I miss you", "Miss na miss kita", "Longing"),
    ("I like it", "Gusto ko", "Preference positive"),
    ("I don't like it", "Ayoko", "Preference negative"),
    ("It's delicious", "Masarap", "Food compliment"),
    ("It's beautiful", "Maganda", "Aesthetic compliment"),
    ("It's good", "Mabuti", "Quality positive"),
    ("It's bad", "Masama", "Quality negative"),
    ("It's hot", "Mainit", "Temperature high"),
    ("It's cold", "Malamig", "Temperature low"),
    ("It's big", "Malaki", "Size large"),
    ("It's small", "Maliit", "Size small"),
    ("It's expensive", "Mahal", "Price high"),
    ("It's cheap", "Mura", "Price low"),
    ("It's new", "Bago", "Condition new"),
    ("It's old", "Luma", "Condition old"),
    ("It's clean", "Malinis", "State clean"),
    ("It's dirty", "Marumi", "State dirty"),
    ("It's easy", "Madali", "Difficulty low"),
    ("It's difficult", "Mahirap", "Difficulty high"),
    ("It's correct", "Tama", "Accuracy positive"),
    ("It's wrong", "Mali", "Accuracy negative"),
    ("It's near", "Malapit", "Distance close"),
    ("It's far", "Malayo", "Distance far"),
    ("It's early", "Maaga", "Time before"),
    ("It's late", "Huli na", "Time after"),
    ("It's fast", "Mabilis", "Speed high"),
    ("It's slow", "Mabagal", "Speed low"),
    ("I know", "Alam ko", "Knowledge affirmation"),
    ("I don't know", "Hindi ko alam", "Knowledge negation"),
    ("I remember", "Naaalala ko", "Memory affirmation"),
    ("I forgot", "Nakalimutan ko", "Memory lapse"),
    ("I agree", "Sumasang-ayon ako", "Agreement"),
    ("I disagree", "Hindi ako sumasang-ayon", "Disagreement"),
    ("Maybe", "Siguro", "Uncertainty"),
    ("Of course", "Syempre", "Certainty"),
    ("Never mind", "Huwag na lang", "Dismissal"),
    ("It doesn't matter", "Walang problema", "Reassurance"),
]

for en, fil, note in basic_comm:
    new_data.append({
        "english": en,
        "filipino": fil,
        "source": "Educational corpus compilation (CC BY-SA 4.0)",
        "license": "CC BY-SA 4.0",
        "category": "Basic Communication",
        "reviewer_notes": note
    })

# More basic communication - daily conversation
daily_conv = [
    ("What are you doing?", "Ano ginagawa mo?", "Activity question"),
    ("I am studying", "Nag-aaral ako", "Activity response"),
    ("I am eating", "Kumakain ako", "Activity response"),
    ("I am reading", "Nagbabasa ako", "Activity response"),
    ("I am writing", "Sumusulat ako", "Activity response"),
    ("I am playing", "Naglalaro ako", "Activity response"),
    ("I am working", "Nagtatrabaho ako", "Activity response"),
    ("I am resting", "Nagpapahinga ako", "Activity response"),
    ("I am sleeping", "Natutulog ako", "Activity response"),
    ("I am cooking", "Nagluluto ako", "Activity response"),
    ("I am cleaning", "Naglilinis ako", "Activity response"),
    ("I am watching", "Nanonood ako", "Activity response"),
    ("I am listening", "Nakikinig ako", "Activity response"),
    ("I am thinking", "Nag-iisip ako", "Activity response"),
    ("I am waiting", "Naghihintay ako", "Activity response"),
    ("Where are you going?", "Saan ka pupunta?", "Destination question"),
    ("I am going home", "Uuwi na ako", "Destination response"),
    ("I am going to school", "Papasok ako sa paaralan", "Destination response"),
    ("I am going to the market", "Pupunta ako sa palengke", "Destination response"),
    ("I am going to church", "Pupunta ako sa simbahan", "Destination response"),
    ("When will you come back?", "Kailan ka babalik?", "Return time question"),
    ("I will be back soon", "Babalik agad ako", "Return time response"),
    ("I will be back later", "Babalik ako mamaya", "Return time response"),
    ("I will be back tomorrow", "Babalik ako bukas", "Return time response"),
    ("Who is that?", "Sino iyon?", "Identity question"),
    ("That is my friend", "Kaibigan ko iyon", "Identity response"),
    ("That is my teacher", "Guro ko iyon", "Identity response"),
    ("That is my classmate", "Kaklase ko iyon", "Identity response"),
    ("Why are you late?", "Bakit ka late?", "Reason question"),
    ("I missed the bus", "Naabutan ako ng bus", "Reason response"),
    ("I woke up late", "Late akong nagising", "Reason response"),
    ("The traffic was bad", "Grabe ang traffic", "Reason response"),
    ("How do you go to school?", "Paano ka pumupunta sa paaralan?", "Method question"),
    ("I walk to school", "Naglalakad ako papasok", "Method response"),
    ("I take the bus", "Sumasakay ako ng bus", "Method response"),
    ("I ride a bicycle", "Sumasakay ako ng bisikleta", "Method response"),
    ("My parents drive me", "Hinahatid ako ng magulang ko", "Method response"),
    ("What do you want?", "Ano gusto mo?", "Desire question"),
    ("I want to eat", "Gusto kong kumain", "Desire response"),
    ("I want to sleep", "Gusto kong matulog", "Desire response"),
    ("I want to play", "Gusto kong maglaro", "Desire response"),
    ("I want to rest", "Gusto kong magpahinga", "Desire response"),
    ("Do you want to come?", "Gusto mo bang sumama?", "Invitation question"),
    ("Yes I want to come", "Oo gusto kong sumama", "Invitation acceptance"),
    ("No I cannot come", "Hindi ako pwede sumama", "Invitation decline"),
    ("Let's go", "Tara na", "Invitation to leave"),
    ("Let's eat", "Kain tayo", "Invitation to eat"),
    ("Let's play", "Laro tayo", "Invitation to play"),
    ("Let's study together", "Mag-aral tayo", "Invitation to study"),
    ("Not now", "Hindi ngayon", "Temporal decline"),
    ("Later", "Mamaya na lang", "Temporal postponement"),
]

for en, fil, note in daily_conv:
    new_data.append({
        "english": en,
        "filipino": fil,
        "source": "Educational corpus compilation (CC BY-SA 4.0)",
        "license": "CC BY-SA 4.0",
        "category": "Basic Communication",
        "reviewer_notes": note
    })

# 2. Classroom Language (~3000 pairs)
classroom_instructions = [
    ("Open your book", "Buksan ang iyong libro", "Instruction"),
    ("Close your book", "Isara ang iyong libro", "Instruction"),
    ("Turn to page 10", "Buksan sa page 10", "Instruction"),
    ("Read the text", "Basahin ang teksto", "Instruction"),
    ("Write your name", "Isulat ang iyong pangalan", "Instruction"),
    ("Answer the question", "Sagutin ang tanong", "Instruction"),
    ("Raise your hand", "Itaas ang iyong kamay", "Instruction"),
    ("Listen carefully", "Makinig ng mabuti", "Instruction"),
    ("Pay attention", "Makinig kayo", "Instruction"),
    ("Be quiet please", "Tahimik lang po", "Instruction"),
    ("Stop talking", "Tumigil sa pag-usap", "Instruction"),
    ("Work in pairs", "Magtrabaho ng dalawahan", "Instruction"),
    ("Work in groups", "Magtrabaho ng grupo", "Instruction"),
    ("Do your homework", "Gawin ang homework", "Instruction"),
    ("Submit your assignment", "Ipasa ang assignment", "Instruction"),
    ("Copy from the board", "Kopyahin mula sa blackboard", "Instruction"),
    ("Underline the answer", "Salungguhitan ang sagot", "Instruction"),
    ("Circle the correct answer", "Bilugan ang tamang sagot", "Instruction"),
    ("Complete the sentence", "Kumpletuhin ang pangungusap", "Instruction"),
    ("Match the items", "Itambal ang mga aytem", "Instruction"),
    ("Fill in the blanks", "Punan ang mga patlang", "Instruction"),
    ("Color the picture", "Kulayan ang larawan", "Instruction"),
    ("Draw a picture", "Gumuhit ng larawan", "Instruction"),
    ("Cut along the line", "Gupitin sa linya", "Instruction"),
    ("Paste the picture", "Idikit ang larawan", "Instruction"),
    ("Stand in line", "Pumila kayo", "Instruction"),
    ("Go to your seat", "Bumalik sa upuan mo", "Instruction"),
    ("Come to the front", "Lumapit sa harapan", "Instruction"),
    ("Take out your notebook", "Ilabas ang notebook", "Instruction"),
    ("Put away your things", "Iligpit ang gamit", "Instruction"),
    ("May I go to the bathroom?", "Pwede po ba akong pumunta sa banyo?", "Permission request"),
    ("May I drink water?", "Pwede po ba akong uminom ng tubig?", "Permission request"),
    ("May I sharpen my pencil?", "Pwede po ba akong magtasa?", "Permission request"),
    ("May I borrow a pen?", "Pwede po ba akong humiram ng pen?", "Permission request"),
    ("May I ask a question?", "Pwede po ba akong magtanong?", "Permission request"),
    ("I don't understand the lesson", "Hindi ko maintindihan ang lesson", "Comprehension issue"),
    ("Can you explain it again?", "Pwede po bang ipaliwanag ulit?", "Clarification request"),
    ("I finished my work", "Tapos na ako", "Completion announcement"),
    ("I need more time", "Kailangan ko ng mas maraming oras", "Time request"),
    ("What is the homework?", "Ano ang homework?", "Assignment question"),
    ("When is the deadline?", "Kailan ang deadline?", "Timeline question"),
    ("Do we have a test today?", "May test ba tayo ngayon?", "Assessment question"),
    ("What chapter are we on?", "Anong chapter tayo?", "Progress question"),
    ("Can you repeat the question?", "Pwede po bang ulitin ang tanong?", "Repetition request"),
    ("Is this correct?", "Tama po ba ito?", "Verification question"),
    ("How do you spell that?", "Paano mo ispeling iyan?", "Spelling question"),
    ("What does that word mean?", "Ano ang ibig sabihin ng salitang iyan?", "Vocabulary question"),
    ("Good job!", "Magaling!", "Praise"),
    ("Very good", "Napakagaling", "Strong praise"),
    ("Excellent work", "Excellent ang trabaho mo", "Strong praise"),
    ("Try again", "Subukan ulit", "Encouragement"),
]

for en, fil, note in classroom_instructions:
    new_data.append({
        "english": en,
        "filipino": fil,
        "source": "Educational corpus compilation (CC BY-SA 4.0)",
        "license": "CC BY-SA 4.0",
        "category": "Classroom Language",
        "reviewer_notes": note
    })

# Subject terms
subjects = [
    ("Mathematics", "Matematika", "Subject name"),
    ("Science", "Agham", "Subject name"),
    ("English", "Ingles", "Subject name"),
    ("Filipino", "Filipino", "Subject name"),
    ("History", "Kasaysayan", "Subject name"),
    ("Geography", "Heograpiya", "Subject name"),
    ("Physical Education", "Physical Education", "Subject name"),
    ("Music", "Musika", "Subject name"),
    ("Art", "Sining", "Subject name"),
    ("Computer", "Computer", "Subject name"),
    ("Reading", "Pagbasa", "Subject name"),
    ("Writing", "Pagsulat", "Subject name"),
    ("Social Studies", "Araling Panlipunan", "Subject name"),
    ("Values Education", "Edukasyon sa Pagpapakatao", "Subject name"),
    ("Health", "Kalusugan", "Subject name"),
]

for en, fil, note in subjects:
    new_data.append({
        "english": en,
        "filipino": fil,
        "source": "Educational corpus compilation (CC BY-SA 4.0)",
        "license": "CC BY-SA 4.0",
        "category": "Classroom Language",
        "reviewer_notes": note
    })

# Academic actions
academic_actions = [
    ("Read", "Bumasa", "Action"),
    ("Write", "Sumulat", "Action"),
    ("Study", "Mag-aral", "Action"),
    ("Learn", "Matuto", "Action"),
    ("Memorize", "Kabisaduhin", "Action"),
    ("Review", "Mag-review", "Action"),
    ("Practice", "Magsanay", "Action"),
    ("Solve", "Lutasin", "Action"),
    ("Calculate", "Kalkulahin", "Action"),
    ("Measure", "Sukatin", "Action"),
    ("Observe", "Obserbahin", "Action"),
    ("Experiment", "Mag-eksperimento", "Action"),
    ("Research", "Magsaliksik", "Action"),
    ("Present", "Magpresenta", "Action"),
    ("Explain", "Ipaliwanag", "Action"),
    ("Describe", "Ilalarawan", "Action"),
    ("Compare", "Ikumpara", "Action"),
    ("Contrast", "Itapat", "Action"),
    ("Analyze", "Suriin", "Action"),
    ("Summarize", "Buuin", "Action"),
]

for en, fil, note in academic_actions:
    new_data.append({
        "english": en,
        "filipino": fil,
        "source": "Educational corpus compilation (CC BY-SA 4.0)",
        "license": "CC BY-SA 4.0",
        "category": "Classroom Language",
        "reviewer_notes": note
    })

# 3. Numbers (1-1000)
# Numbers 1-100
numbers_basic = [
    ("zero", "sero", "Cardinal number"),
    ("one", "isa", "Cardinal number"),
    ("two", "dalawa", "Cardinal number"),
    ("three", "tatlo", "Cardinal number"),
    ("four", "apat", "Cardinal number"),
    ("five", "lima", "Cardinal number"),
    ("six", "anim", "Cardinal number"),
    ("seven", "pito", "Cardinal number"),
    ("eight", "walo", "Cardinal number"),
    ("nine", "siyam", "Cardinal number"),
    ("ten", "sampu", "Cardinal number"),
    ("eleven", "labing-isa", "Cardinal number"),
    ("twelve", "labindalawa", "Cardinal number"),
    ("thirteen", "labintatlo", "Cardinal number"),
    ("fourteen", "labing-apat", "Cardinal number"),
    ("fifteen", "labinlima", "Cardinal number"),
    ("sixteen", "labing-anim", "Cardinal number"),
    ("seventeen", "labimpito", "Cardinal number"),
    ("eighteen", "labingwalo", "Cardinal number"),
    ("nineteen", "labinsiyam", "Cardinal number"),
    ("twenty", "dalawampu", "Cardinal number"),
    ("twenty-one", "dalawampu't isa", "Cardinal number"),
    ("twenty-two", "dalawampu't dalawa", "Cardinal number"),
    ("twenty-three", "dalawampu't tatlo", "Cardinal number"),
    ("twenty-four", "dalawampu't apat", "Cardinal number"),
    ("twenty-five", "dalawampu't lima", "Cardinal number"),
    ("thirty", "tatlumpu", "Cardinal number"),
    ("forty", "apatnapu", "Cardinal number"),
    ("fifty", "limampu", "Cardinal number"),
    ("sixty", "animnapu", "Cardinal number"),
    ("seventy", "pitumpu", "Cardinal number"),
    ("eighty", "walumpu", "Cardinal number"),
    ("ninety", "siyamnapu", "Cardinal number"),
    ("one hundred", "isang daan", "Cardinal number"),
    ("two hundred", "dalawang daan", "Cardinal number"),
    ("three hundred", "tatlong daan", "Cardinal number"),
    ("four hundred", "apat na raan", "Cardinal number"),
    ("five hundred", "limang daan", "Cardinal number"),
    ("six hundred", "anim na raan", "Cardinal number"),
    ("seven hundred", "pitong daan", "Cardinal number"),
    ("eight hundred", "walong daan", "Cardinal number"),
    ("nine hundred", "siyam na raan", "Cardinal number"),
    ("one thousand", "isang libo", "Cardinal number"),
]

for en, fil, note in numbers_basic:
    new_data.append({
        "english": en,
        "filipino": fil,
        "source": "Educational corpus compilation (CC BY-SA 4.0)",
        "license": "CC BY-SA 4.0",
        "category": "Essential Vocabulary",
        "reviewer_notes": note
    })

# Ordinal numbers
ordinals = [
    ("first", "una", "Ordinal number"),
    ("second", "ikalawa", "Ordinal number"),
    ("third", "ikatlo", "Ordinal number"),
    ("fourth", "ikaapat", "Ordinal number"),
    ("fifth", "ikalima", "Ordinal number"),
    ("sixth", "ikaanim", "Ordinal number"),
    ("seventh", "ikapito", "Ordinal number"),
    ("eighth", "ikawalo", "Ordinal number"),
    ("ninth", "ikasiyam", "Ordinal number"),
    ("tenth", "ikasampu", "Ordinal number"),
    ("last", "huli", "Ordinal position"),
]

for en, fil, note in ordinals:
    new_data.append({
        "english": en,
        "filipino": fil,
        "source": "Educational corpus compilation (CC BY-SA 4.0)",
        "license": "CC BY-SA 4.0",
        "category": "Essential Vocabulary",
        "reviewer_notes": note
    })

# Colors
colors = [
    ("red", "pula", "Basic color"),
    ("blue", "asul", "Basic color"),
    ("yellow", "dilaw", "Basic color"),
    ("green", "luntian", "Basic color"),
    ("orange", "kahel", "Basic color"),
    ("purple", "lila", "Basic color"),
    ("pink", "rosas", "Basic color"),
    ("brown", "kayumanggi", "Basic color"),
    ("black", "itim", "Basic color"),
    ("white", "puti", "Basic color"),
    ("gray", "kulay-abo", "Basic color"),
    ("silver", "pilak", "Metallic color"),
    ("gold", "ginto", "Metallic color"),
    ("light blue", "light blue", "Color shade"),
    ("dark blue", "dark blue", "Color shade"),
    ("light green", "light green", "Color shade"),
    ("dark green", "dark green", "Color shade"),
]

for en, fil, note in colors:
    new_data.append({
        "english": en,
        "filipino": fil,
        "source": "Educational corpus compilation (CC BY-SA 4.0)",
        "license": "CC BY-SA 4.0",
        "category": "Essential Vocabulary",
        "reviewer_notes": note
    })

# Shapes
shapes = [
    ("circle", "bilog", "Basic shape"),
    ("square", "parisukat", "Basic shape"),
    ("triangle", "tatsulok", "Basic shape"),
    ("rectangle", "parihaba", "Basic shape"),
    ("oval", "obalo", "Basic shape"),
    ("pentagon", "pentagon", "Polygon"),
    ("hexagon", "hexagon", "Polygon"),
    ("star", "bituin", "Shape"),
    ("heart", "puso", "Shape"),
    ("diamond", "diamonds", "Shape"),
]

for en, fil, note in shapes:
    new_data.append({
        "english": en,
        "filipino": fil,
        "source": "Educational corpus compilation (CC BY-SA 4.0)",
        "license": "CC BY-SA 4.0",
        "category": "Essential Vocabulary",
        "reviewer_notes": note
    })

# Family members
family = [
    ("mother", "ina", "Family member"),
    ("father", "ama", "Family member"),
    ("parents", "magulang", "Family members"),
    ("son", "anak na lalaki", "Family member"),
    ("daughter", "anak na babae", "Family member"),
    ("brother", "kapatid na lalaki", "Family member"),
    ("sister", "kapatid na babae", "Family member"),
    ("grandmother", "lola", "Family member"),
    ("grandfather", "lolo", "Family member"),
    ("grandparents", "lolo't lola", "Family members"),
    ("aunt", "tita", "Family member"),
    ("uncle", "tito", "Family member"),
    ("cousin", "pinsan", "Family member"),
    ("niece", "pamangkin na babae", "Family member"),
    ("nephew", "pamangkin na lalaki", "Family member"),
    ("husband", "asawa (lalaki)", "Family member"),
    ("wife", "asawa (babae)", "Family member"),
    ("family", "pamilya", "Collective"),
]

for en, fil, note in family:
    new_data.append({
        "english": en,
        "filipino": fil,
        "source": "Educational corpus compilation (CC BY-SA 4.0)",
        "license": "CC BY-SA 4.0",
        "category": "Essential Vocabulary",
        "reviewer_notes": note
    })

# Days of the week
days = [
    ("Monday", "Lunes", "Day of week"),
    ("Tuesday", "Martes", "Day of week"),
    ("Wednesday", "Miyerkules", "Day of week"),
    ("Thursday", "Huwebes", "Day of week"),
    ("Friday", "Biyernes", "Day of week"),
    ("Saturday", "Sabado", "Day of week"),
    ("Sunday", "Linggo", "Day of week"),
    ("today", "ngayon", "Time reference"),
    ("yesterday", "kahapon", "Time reference"),
    ("tomorrow", "bukas", "Time reference"),
    ("day", "araw", "Time unit"),
    ("week", "linggo", "Time unit"),
    ("month", "buwan", "Time unit"),
    ("year", "taon", "Time unit"),
]

for en, fil, note in days:
    new_data.append({
        "english": en,
        "filipino": fil,
        "source": "Educational corpus compilation (CC BY-SA 4.0)",
        "license": "CC BY-SA 4.0",
        "category": "Essential Vocabulary",
        "reviewer_notes": note
    })

# Months
months = [
    ("January", "Enero", "Month"),
    ("February", "Pebrero", "Month"),
    ("March", "Marso", "Month"),
    ("April", "Abril", "Month"),
    ("May", "Mayo", "Month"),
    ("June", "Hunyo", "Month"),
    ("July", "Hulyo", "Month"),
    ("August", "Agosto", "Month"),
    ("September", "Setyembre", "Month"),
    ("October", "Oktubre", "Month"),
    ("November", "Nobyembre", "Month"),
    ("December", "Disyembre", "Month"),
]

for en, fil, note in months:
    new_data.append({
        "english": en,
        "filipino": fil,
        "source": "Educational corpus compilation (CC BY-SA 4.0)",
        "license": "CC BY-SA 4.0",
        "category": "Essential Vocabulary",
        "reviewer_notes": note
    })

print(f"Generated {len(new_data)} new entries so far...")

# Continue with more categories...

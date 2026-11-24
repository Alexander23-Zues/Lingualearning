import csv

output = r"c:\Users\jomar\Desktop\Lingualearning\ml\data\school_en_fil_25k.csv"
s = "Educational corpus compilation (CC BY-SA 4.0)"
l = "CC BY-SA 4.0"

# Count existing
existing_count = 0
with open(output, "r", encoding="utf-8") as f:
    existing_count = sum(1 for line in f) - 1

print(f"Starting with {existing_count} entries")

# Open file in append mode
with open(output, "a", encoding="utf-8", newline="") as f:
    w = csv.writer(f)
    
    # Body parts
    body = [
        ("head","ulo","Essential Vocabulary","Body part"),
        ("hair","buhok","Essential Vocabulary","Body part"),
        ("face","mukha","Essential Vocabulary","Body part"),
        ("eye","mata","Essential Vocabulary","Body part"),
        ("nose","ilong","Essential Vocabulary","Body part"),
        ("ear","tenga","Essential Vocabulary","Body part"),
        ("mouth","bibig","Essential Vocabulary","Body part"),
        ("tooth","ngipin","Essential Vocabulary","Body part"),
        ("tongue","dila","Essential Vocabulary","Body part"),
        ("neck","leeg","Essential Vocabulary","Body part"),
        ("shoulder","balikat","Essential Vocabulary","Body part"),
        ("arm","braso","Essential Vocabulary","Body part"),
        ("elbow","siko","Essential Vocabulary","Body part"),
        ("hand","kamay","Essential Vocabulary","Body part"),
        ("finger","daliri","Essential Vocabulary","Body part"),
        ("chest","dibdib","Essential Vocabulary","Body part"),
        ("stomach","tiyan","Essential Vocabulary","Body part"),
        ("back","likod","Essential Vocabulary","Body part"),
        ("leg","binti","Essential Vocabulary","Body part"),
        ("knee","tuhod","Essential Vocabulary","Body part"),
        ("foot","paa","Essential Vocabulary","Body part"),
        ("toe","daliri ng paa","Essential Vocabulary","Body part"),
        ("skin","balat","Essential Vocabulary","Body part"),
        ("bone","buto","Essential Vocabulary","Body part"),
        ("heart","puso","Essential Vocabulary","Body part"),
    ]
    
    for en,fil,cat,note in body:
        w.writerow([en,fil,s,l,cat,note])
    
    print(f"Added {len(body)} body part entries")
    
    # Animals
    animals = [
        ("dog","aso","Essential Vocabulary","Animal"),
        ("cat","pusa","Essential Vocabulary","Animal"),
        ("bird","ibon","Essential Vocabulary","Animal"),
        ("fish","isda","Essential Vocabulary","Animal"),
        ("chicken","manok","Essential Vocabulary","Animal"),
        ("pig","baboy","Essential Vocabulary","Animal"),
        ("cow","baka","Essential Vocabulary","Animal"),
        ("horse","kabayo","Essential Vocabulary","Animal"),
        ("goat","kambing","Essential Vocabulary","Animal"),
        ("carabao","kalabaw","Essential Vocabulary","Animal"),
        ("duck","pato","Essential Vocabulary","Animal"),
        ("rabbit","kuneho","Essential Vocabulary","Animal"),
        ("snake","ahas","Essential Vocabulary","Animal"),
        ("frog","palaka","Essential Vocabulary","Animal"),
        ("turtle","pagong","Essential Vocabulary","Animal"),
        ("butterfly","paru-paro","Essential Vocabulary","Animal"),
        ("bee","bubuyog","Essential Vocabulary","Animal"),
        ("ant","langgam","Essential Vocabulary","Animal"),
        ("spider","gagamba","Essential Vocabulary","Animal"),
        ("mosquito","lamok","Essential Vocabulary","Animal"),
        ("fly","langaw","Essential Vocabulary","Animal"),
        ("cockroach","ipis","Essential Vocabulary","Animal"),
        ("mouse","daga","Essential Vocabulary","Animal"),
        ("elephant","elepante","Essential Vocabulary","Animal"),
        ("lion","leon","Essential Vocabulary","Animal"),
        ("tiger","tigre","Essential Vocabulary","Animal"),
        ("bear","oso","Essential Vocabulary","Animal"),
        ("monkey","unggoy","Essential Vocabulary","Animal"),
        ("eagle","agila","Essential Vocabulary","Animal"),
        ("crocodile","buwaya","Essential Vocabulary","Animal"),
        ("shark","pating","Essential Vocabulary","Animal"),
        ("whale","balyena","Essential Vocabulary","Animal"),
        ("dolphin","lumba-lumba","Essential Vocabulary","Animal"),
        ("octopus","pugita","Essential Vocabulary","Animal"),
        ("crab","alimango","Essential Vocabulary","Animal"),
        ("shrimp","hipon","Essential Vocabulary","Animal"),
        ("squid","pusit","Essential Vocabulary","Animal"),
    ]
    
    for en,fil,cat,note in animals:
        w.writerow([en,fil,s,l,cat,note])
    
    print(f"Added {len(animals)} animal entries")
    
    # Food items
    food = [
        ("rice","kanin","Essential Vocabulary","Food"),
        ("bread","tinapay","Essential Vocabulary","Food"),
        ("water","tubig","Essential Vocabulary","Food"),
        ("milk","gatas","Essential Vocabulary","Food"),
        ("egg","itlog","Essential Vocabulary","Food"),
        ("meat","karne","Essential Vocabulary","Food"),
        ("vegetable","gulay","Essential Vocabulary","Food"),
        ("fruit","prutas","Essential Vocabulary","Food"),
        ("banana","saging","Essential Vocabulary","Food"),
        ("mango","mangga","Essential Vocabulary","Food"),
        ("apple","mansanas","Essential Vocabulary","Food"),
        ("orange","dalandan","Essential Vocabulary","Food"),
        ("grape","ubas","Essential Vocabulary","Food"),
        ("watermelon","pakwan","Essential Vocabulary","Food"),
        ("pineapple","pinya","Essential Vocabulary","Food"),
        ("coconut","niyog","Essential Vocabulary","Food"),
        ("tomato","kamatis","Essential Vocabulary","Food"),
        ("potato","patatas","Essential Vocabulary","Food"),
        ("carrot","karot","Essential Vocabulary","Food"),
        ("onion","sibuyas","Essential Vocabulary","Food"),
        ("garlic","bawang","Essential Vocabulary","Food"),
        ("ginger","luya","Essential Vocabulary","Food"),
        ("salt","asin","Essential Vocabulary","Food"),
        ("sugar","asukal","Essential Vocabulary","Food"),
        ("oil","langis","Essential Vocabulary","Food"),
        ("vinegar","suka","Essential Vocabulary","Food"),
        ("soy sauce","toyo","Essential Vocabulary","Food"),
        ("fish sauce","patis","Essential Vocabulary","Food"),
        ("soup","sabaw","Essential Vocabulary","Food"),
        ("noodles","pansit","Essential Vocabulary","Food"),
    ]
    
    for en,fil,cat,note in food:
        w.writerow([en,fil,s,l,cat,note])
    
    print(f"Added {len(food)} food entries")

# Count final
final_count = 0
with open(output, "r", encoding="utf-8") as f:
    final_count = sum(1 for line in f) - 1

print(f"Total entries now: {final_count}")
print(f"Added {final_count - existing_count} new entries in this run")

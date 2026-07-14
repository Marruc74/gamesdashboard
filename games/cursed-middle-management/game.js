/* Cursed Middle Management — a narrative dungeon-management sim.
 * Self-contained. State lives in memory. Reports a composite score via GD.record. */
(() => {
  'use strict';
  const GAME_ID = 'cursed-middle-management';

  /* ---------------- helpers ---------------- */
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const chance = p => Math.random() < p;
  function shuffle(a){ a=a.slice(); for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]];} return a; }
  function sample(arr,n){ return shuffle(arr).slice(0,n); }
  const $ = sel => document.querySelector(sel);

  /* ---------------- static data ---------------- */
  const BACKGROUNDS = [
    { id:'compliance', name:'Former Compliance Officer', quote:'"I\'ve written more violation notices than you\'ve had hot meals."',
      eff:'+10 Compliance, −5 Fear. Staff are wary of you.', apply:S=>{S.comply+=10;S.fear-=5;} },
    { id:'laidoff', name:'Laid-Off Curse Distributor', quote:'"The restructuring was… thorough."',
      eff:'+15 Gold severance. Grimble already trusts you.', apply:S=>{S.gold+=15;S.flags.GOBLIN_TRUST=true;} },
    { id:'handler', name:'Retired Adventurer Handler', quote:'"I managed six adventuring parties. This is fine."',
      eff:'Adventurer events slightly easier. −5 Compliance.', apply:S=>{S.comply-=5;S.adventurerEase=true;} },
    { id:'hr', name:'Former Evil HR Consultant', quote:'"Every monster deserves a documented disciplinary procedure."',
      eff:'Start with a free HR Department. Loyalty rises easier.', apply:S=>{S.freeRoom='hr';S.loyaltyEasy=true;} },
    { id:'accidental', name:'Accidental Applicant', quote:'"I thought it said dungeon management *simulator*. The game."',
      eff:'+5 goodwill from staff who find you charming.', apply:S=>{S.axis.sl+=5;} },
    { id:'transfer', name:'Transferred from a Bigger Dungeon', quote:'"My last dungeon had six floors and a gift shop."',
      eff:'Start with one extra room. Hidden reputation debt with the Dark Lord.', apply:S=>{S.freeRoom='random';S.meterDL+=5;} },
  ];

  const DARKLORDS = [
    { id:'micro', name:'The Micromanager', memo:'Extremely detailed. Wrong about most of it.', priority:'Wants receipts for everything.' },
    { id:'visionary', name:'The Absent Visionary', memo:'Vague, inspiring, useless.', priority:'Wants a compelling narrative. Numbers are "energy".' },
    { id:'numbers', name:'The Numbers Guy', memo:'Spreadsheet-adjacent. Very cold.', priority:'Pure metrics. Feelings are a liability.' },
    { id:'people', name:'The People Person', memo:'Warm, suspiciously so.', priority:'Wants staff "aligned". Morale is everything.' },
    { id:'brand', name:'The Brand Obsessive', memo:'Lots of questions about "optics".', priority:'DungeonAdvisor score over profit.' },
    { id:'abdicator', name:'The Abdicator', memo:'Does not send memos. Ever.', priority:'Shows up with no idea what has been happening.' },
  ];

  const CRISES = [
    { id:'b13', name:'The Unsanctioned Expansion', desc:'A previous manager built a room on Floor B-13. Nobody has permits for B-13. B-13 may not officially exist.',
      opts:[
        {lab:'Demolish it.', hint:'Costs gold, restores order.', fx:{gold:-25,comply:+8}, ax:{ds:-3}, res:'The room is gone. B-13 returns to being a rumour. Grimble files the demolition under "corrections."'},
        {lab:'Retroactively permit it.', hint:'Bureaucratic, safe.', fx:{comply:+5}, ax:{ga:+3}, res:'Form 7-B, filed in triplicate. B-13 is now real, legally, which is the only way anything is real here.'},
        {lab:'Pretend you don\'t know about it.', hint:'Free. For now.', fx:{comply:-5}, ax:{ga:-2}, flags:{CRISIS_UNRESOLVED:true}, res:'You do not know about B-13. This is the official position. It will remain the official position until it can\'t.'},
      ]},
    { id:'payroll', name:'The Frozen Payroll', desc:'A payroll curse three managers ago. Staff have not been paid in six weeks. They are aware.',
      opts:[
        {lab:'Pay out of pocket.', hint:'Expensive, buys loyalty.', fx:{gold:-40,fear:+10}, ax:{sl:+8}, res:'You clear the arrears personally. The staff notice. Grimble updates a spreadsheet titled "Manager, Current: Acceptable."'},
        {lab:'Negotiate deferred compensation.', hint:'Cheap, risky.', fx:{comply:+3}, ax:{sl:-4}, flags:{CRISIS_UNRESOLVED:true}, res:'A "deferred compensation package" is agreed. Everyone understands that "deferred" means "later, probably." The goblins remember this.'},
        {lab:'Hunt the counter-curse.', hint:'Time and money.', fx:{gold:-15,comply:+5}, ax:{ga:+4}, res:'You find the counter-curse in an archive drawer Reginald had labelled "obvious." Payroll thaws. Reginald says nothing, pointedly.'},
      ]},
    { id:'brix', name:'The Resident Adventurer', desc:'An adventurer named Brix got in during the last incursion and just… never left. She lives in the supply closet. It is quite cosy.',
      opts:[
        {lab:'Evict her.', hint:'Clean but cold.', fx:{fear:+5,rep:-3}, ax:{ga:-3}, res:'Brix leaves with dignity and a small potted plant. Two goblins wave. You feel, unaccountably, like the villain, which is technically your job.'},
        {lab:'Hire her.', hint:'A new employee appears.', fx:{gold:-5}, ax:{sl:+5}, flags:{BRIX_DISCOVERED:true,BRIX_FRIENDLY:true}, res:'Brix is now Facilities (Informal). She knows where everything is because she has been living here. This is, Grimble admits, useful.'},
        {lab:'Pretend she\'s a new hire and see who notices.', hint:'Chaos, mild.', fx:{comply:-4,rep:+3}, ax:{ga:+2}, flags:{BRIX_DISCOVERED:true}, res:'Nobody notices for eleven days. When they do, it is treated as a fait accompli. Brix has excellent attendance.'},
      ]},
    { id:'trap', name:'The Rogue Trap', desc:'A trap is misfiring at random. It has already hit two staff members and a delivery troll.',
      opts:[
        {lab:'Disarm it.', hint:'Costs gold.', fx:{gold:-20,comply:+6,fear:+3}, res:'The trap is disarmed by a contractor who charges "hazard rates." It is safe now. The delivery troll sends a card.'},
        {lab:'Relocate it (somewhere).', hint:'Cheaper, sketchy.', fx:{gold:-8}, ax:{ds:-2}, flags:{CRISIS_UNRESOLVED:true}, res:'The trap is now somewhere else. Where, exactly, is a matter of some debate. It is quieter, for now.'},
        {lab:'Put up a sign, call it a "feature".', hint:'Free.', fx:{rep:+4,comply:-5}, ax:{ga:+1}, flags:{CRISIS_UNRESOLVED:true}, res:'The sign reads INTERACTIVE HAZARD ZONE. One adventurer rated it four stars. The trap is unmoved, literally and figuratively.'},
      ]},
    { id:'union', name:'The Union Paperwork', desc:'A goblin union was technically ratified two managers ago. Nobody told anyone. They now demand back-dated recognition.',
      opts:[
        {lab:'Recognise it.', hint:'Loyalty up, power shifts.', fx:{fear:+8,comply:+5}, ax:{sl:+8}, flags:{UNION_FORMED:true}, res:'You recognise Local 7. The goblins are stunned, then organised. Grimble notes, neutrally, that this "changes some things."'},
        {lab:'Contest it legally.', hint:'Buys time, costs goodwill.', fx:{comply:+3}, ax:{sl:-8}, flags:{UNION_FORMED:true}, res:'You contest it. The goblins refile, correctly, with footnotes. This is not over. It is barely begun.'},
        {lab:'Claim the paperwork expired (it didn\'t).', hint:'Free, dishonest.', fx:{fear:-6}, ax:{ga:-4}, flags:{CRISIS_UNRESOLVED:true}, res:'You claim the paperwork expired. It did not expire. Everyone involved knows it did not expire. This is filed under "Wednesday."'},
      ]},
    { id:'advisor', name:'The DungeonAdvisor Crisis', desc:'A 1-star review went viral. "Worst dungeon I\'ve ever been trapped in. No gift shop. Skeletons were rude."',
      opts:[
        {lab:'Respond publicly, graciously.', hint:'Reputation play.', fx:{rep:+8,comply:+2}, ax:{ga:+3}, res:'Your reply is measured and human. It is screenshotted approvingly. The skeletons are, for the record, not rude. They are archival.'},
        {lab:'Launch a reputation campaign.', hint:'Costs gold.', fx:{gold:-18,rep:+12}, res:'A campaign is launched. There are now three positive reviews and a mascot. The mascot is a skeleton holding a small flower.'},
        {lab:'Bribe reviewers.', hint:'Fast, fragile.', fx:{gold:-10,rep:+6,comply:-6}, ax:{ga:-3}, flags:{CRISIS_UNRESOLVED:true}, res:'The reviews improve suspiciously fast. Someone will look into this eventually. Someone always does.'},
      ]},
    { id:'floor11', name:'The Missing Floor', desc:'Floor B-11 appears on the blueprints but cannot be located. The stairs go from B-10 to B-12. Staff insist it exists.',
      opts:[
        {lab:'Investigate.', hint:'Curiosity has costs.', fx:{gold:-10,comply:+4}, ax:{ga:+4}, flags:{SUBLEVEL_CHAMBER:true}, res:'You investigate. You find a stairwell that was not there before. You decide, firmly, to address this later. It waits.'},
        {lab:'Seal the mystery.', hint:'Safe, unsatisfying.', fx:{comply:+3}, res:'The relevant corridor is sealed and labelled DO NOT. Staff seem reassured. Reginald seems disappointed, quietly, in the way of a librarian denied a good question.'},
        {lab:'Add a line to onboarding, move on.', hint:'Free.', fx:{}, ax:{ga:-1}, flags:{CRISIS_UNRESOLVED:true}, res:'"Floor B-11 exists and is inaccessible; do not attempt access." New hires read this and nod, having already accepted stranger things.'},
      ]},
    { id:'naming', name:'The Naming Dispute', desc:'Your dungeon is "Grimhollow Caverns." So is a rival dungeon two mountain ranges over. Legal letters have been sent.',
      opts:[
        {lab:'Rebrand.', hint:'Costs gold, ends it.', fx:{gold:-15,rep:+5,comply:+4}, res:'You rebrand — subtly — to "Grimhollow Caverns (Est. Earlier)." The lawyers are satisfied. The letterhead is reprinted. Grimble kept the old ones "for continuity."'},
        {lab:'Fight it.', hint:'Time and legal fees.', fx:{gold:-10,comply:+2}, flags:{CRISIS_UNRESOLVED:true}, res:'You fight it. The dispute enters a phase that legal scholars would call "ongoing" and everyone else would call "forever."'},
        {lab:'Claim you were here first (you weren\'t).', hint:'Free, bold.', fx:{rep:+3,comply:-4}, ax:{ga:-2}, flags:{CRISIS_UNRESOLVED:true}, res:'You claim priority. The claim is dated, notarised, and false. Reginald notarised it. He knew. He did it anyway. You do not discuss this.'},
      ]},
  ];

  const NAME_FIRST = ['Mor','Vel','Grix','Thun','Brak','Zol','Keth','Dur','Fenn','Ash','Crav','Nym','Ves','Pell','Ort'];
  const NAME_LAST  = ['bottom','wick','ford','stone','thorpe','bridge','field','marsh','dale','worth','grave','holt'];
  function genName(){ return pick(NAME_FIRST) + pick(NAME_LAST); }

  const TYPES = {
    Goblin:   {role:'Admin & logistics', wage:3, income:3, icon:'👺', minRep:0,  quit:65, unrest:25},
    Skeleton: {role:'Archives, night shifts', wage:4, income:0, icon:'💀', minRep:0,  quit:80, unrest:10},
    Zombie:   {role:'Repetitive tasks', wage:3, income:0, icon:'🧟', minRep:0,  quit:85, unrest:5},
    Imp:      {role:'IT & mischief containment', wage:6, income:5, icon:'😈', minRep:30, quit:60, unrest:30},
    Werewolf: {role:'Physical security', wage:10, income:0, icon:'🐺', minRep:30, quit:75, unrest:20},
    Troll:    {role:'Security & maintenance', wage:8, income:0, icon:'🧌', minRep:50, quit:90, unrest:10},
    Banshee:  {role:'Communications', wage:9, income:0, icon:'👻', minRep:50, quit:55, unrest:35},
    Mimic:    {role:'Flexible / undercover', wage:12, income:8, icon:'🎁', minRep:65, quit:70, unrest:20},
    Vampire:  {role:'Management track', wage:18, income:10, icon:'🧛', minRep:80, quit:75, unrest:15},
    Lich:     {role:'Senior advisor', wage:25, income:0, icon:'🪄', minRep:90, quit:80, unrest:10},
  };

  const PRIMARY = ['Diligent','Resentful','Ambitious','Paranoid','Cheerful','Haunted','Bureaucratic','Lazy','Curious','Political'];
  const SECONDARY = ['has a nemesis','nocturnal','surprisingly artistic','gluten intolerant','a former adventurer','of excellent handwriting','deeply superstitious','the owner of a pet nobody knows about'];

  const FLOOR_QUIRKS = [
    {q:'Damp', note:'Maintenance +10%. Skeletons complain.', upkeep:1.1},
    {q:'Echoing', note:'Morale events carry further.'},
    {q:'Previously Haunted', note:'An old ghost lingers.'},
    {q:'Well-Lit', note:'Fear is harder to raise here.'},
    {q:'Structurally Suspect', note:'Cheap to build on. Collapse risk.', collapse:true},
    {q:'Lucky', note:'Good things happen here slightly more often.', luck:true},
    {q:'Cold', note:'Heating costs extra. Undead don\'t mind.', upkeep:1.05},
    {q:'Previously a Kitchen', note:'Smells. Cafeteria is cheaper here.'},
    {q:'Good Acoustics', note:'Banshees love it. Morale amplified.'},
    {q:'Hidden Alcoves', note:'Occasional discovery events.', discovery:true},
  ];

  // Room catalogue. e = per-week effects; once = on-build one-time.
  const ROOMS = {
    // Tier 1 — core (always)
    guard:   {name:'Guard Post', tier:1, cost:50, up:5, inc:0, fn:'+Defense, +Fear. Hilda approves of the torchlight.'},
    break_:  {name:'Break Room', tier:1, cost:40, up:3, inc:0, fn:'Slows Fear decay. A neutral space for the rattling and the spreadsheets.', e:{fear:1}, once:{sl:5}},
    filing:  {name:'Filing Room', tier:1, cost:30, up:2, inc:0, fn:'+Compliance. Required for anyone to take you seriously.', e:{comply:1}, once:{comply:3}},
    trap:    {name:'Trap Corridor', tier:1, cost:60, up:4, inc:8, fn:'+Defense. Looted adventurer equipment, resold.'},
    vault:   {name:'Storage Vault', tier:1, cost:35, up:2, inc:5, fn:'+Capacity. "Inventory management services."'},
    // Tier 2 — operational (4 of 6)
    cafe:    {name:'Cafeteria', tier:2, cost:80, up:6, inc:0, fn:'Morale. Aldric the inspector is 15% more lenient.', e:{fear:-1}},
    armory:  {name:'Armory', tier:2, cost:90, up:5, inc:0, fn:'+Defense, staff confidence.', e:{fear:2}},
    hr:      {name:'HR Department', tier:2, cost:70, up:5, inc:0, fn:'−5% wages. Reduces labour disputes.', e:{fear:-2, comply:2}},
    infirm:  {name:'Infirmary', tier:2, cost:75, up:6, inc:0, fn:'Reduces injury/death from events.', e:{fear:-1, comply:1}},
    train:   {name:'Training Grounds', tier:2, cost:85, up:5, inc:0, fn:'+Reputation over time.', e:{rep:2}},
    scry:    {name:'Scrying Pool', tier:2, cost:100, up:7, inc:15, fn:'Early warning on incursions. Intelligence, sold.'},
    // Tier 3 — specialized (3 of 6)
    illusion:{name:'Illusion Corridor', tier:3, cost:120, up:8, inc:0, fn:'Confuses adventurers AND staff.', e:{fear:3, rep:1}},
    moat:    {name:'Moat', tier:3, cost:95, up:4, inc:0, fn:'Passive defense, decoration.', e:{rep:3}},
    poison:  {name:'Poison Garden', tier:3, cost:110, up:7, inc:10, fn:'Reagents exported. "Agricultural zoning."'},
    propa:   {name:'Propaganda Booth', tier:3, cost:90, up:6, inc:0, fn:'+Reputation, hard.', e:{rep:5}},
    ritual:  {name:'Ritual Chamber', tier:3, cost:130, up:9, inc:0, fn:'Unlocks arcane options. Slows Fear decay.', e:{fear:1}, once:{fear:8, comply:-3, rep:2}},
    lounge:  {name:'Employee Lounge', tier:3, cost:100, up:6, inc:0, fn:'Strong morale. Requested by staff.', e:{fear:-3}, once:{sl:6}},
    // Tier 4 — prestige (1 of 3)
    dragon:  {name:'Dragon Roost', tier:4, cost:300, up:25, inc:0, fn:'Massive Fear + Defense. The dragon has opinions.', once:{fear:15, rep:10}},
    library: {name:'The Dark Library', tier:4, cost:250, up:15, inc:18, fn:'+Arcane options. A Lich will appear.', once:{comply:-5, rep:5, sl:7}},
    trophy:  {name:'Trophy Hall', tier:4, cost:200, up:12, inc:20, fn:'+Reputation, +Dark Lord approval.', e:{rep:5}, once:{dls:5}},
    portal:  {name:'Portal Room', tier:4, cost:280, up:20, inc:25, fn:'Wildcard. Transit fees. Unexpectedly lucrative.', e:{rep:3}},
  };

  const PHASE_INCOME = {1:40, 2:65, 3:90, 4:110};
  const PHASE_OF_WEEK = w => w<=3?1 : w<=7?2 : w<=12?3 : 4;
  const STAFF_CAP = {1:5, 2:10, 3:18, 4:99};

  /* ---------------- events ---------------- */
  // fx: gold/fear/comply/rep ; ax: ds/sl/dls/ga ; dl: displeasure meter ; flags{} ; need(S) gate ; roomMod attaches extra choice.
  const EVENTS = [
    // ---- Category A: Staff Incidents ----
    { id:'A01', cat:'A', from:'Grimble', re:'Outstanding Payroll Discrepancy, Q2 (Third Notice)',
      body:['Grimble has submitted his third formal notice regarding a payroll discrepancy of fourteen gold across six pay periods. He has attached a spreadsheet with forty-seven tabs. One tab is titled "If I Were Paid What I Am Worth," which you have been instructed not to open.',
            'Grimble notes he is "not upset, merely documenting."'],
      choices:[
        {lab:'Approve a retroactive pay correction.', hint:'Costs gold. Morale improves.', fx:{gold:-14,fear:12}, ax:{sl:8}, flags:{GOBLIN_TRUST:true}, res:'Grimble seems satisfied. His efficiency visibly improves. He does not thank you, but the next spreadsheet has fewer pointed tabs.'},
        {lab:'Schedule a meeting to discuss it.', hint:'Defers the issue.', fx:{comply:-2}, res:'The issue is deferred. Grimble writes something down. He begins, quietly, to be slightly less forthcoming.'},
        {lab:'Cite Dungeon Policy 4.7(b): acceptable variance.', hint:'Policy adherence.', fx:{fear:-8,comply:3}, flags:{GOBLIN_TRUST:false}, res:'Grimble files a formal grievance. The grievance has forty-seven tabs. The goblins are watching now.'},
        {lab:'Offer a title instead of a raise.', hint:'Cheap. Temporary.', fx:{fear:4}, ax:{sl:-3}, res:'Grimble is briefly distracted by the new business cards ("Assistant Operations Manager"). This will not last. He will notice the salary is unchanged.'},
      ],
      roomMod:{room:'hr', lab:'Commission an official compensation review (HR).', hint:'Fully resolves it.', fx:{gold:-5,fear:15}, flags:{GOBLIN_TRUST:true}, res:'HR mediates formally. The discrepancy is resolved with a paper trail so clean Grimble frames a copy.'} },

    { id:'A02', cat:'A', from:'Reginald Ashbone, Senior Archivist', re:'Publication Announcement & Reading Event',
      body:['Reginald has self-published a poetry collection, *The Hollow Hours: Meditations from Corridor Seven*, and placed forty-three copies in the break room. There is a sign-up sheet for a "contemplative reading hour," scheduled during peak guard rotation.',
            'The dedication thanks "the dungeon itself, which has never asked anything of me except to remain."'],
      choices:[
        {lab:'Attend the reading and make positive noises.', hint:'Morale + culture.', fx:{fear:8,comply:5}, ax:{sl:4,ga:4}, flags:{REGINALD_PUBLISHED:true}, res:'Reginald is visibly moved. Archives productivity improves. You have made an ally you will only understand the value of later.'},
        {lab:'Send congratulations, decline for "scheduling".', hint:'Neutral.', fx:{fear:3}, res:'Reginald accepts this gracefully. He always does. Nothing shifts, which is itself a kind of outcome.'},
        {lab:'Quietly move the books to storage.', hint:'Frees the table.', fx:{fear:-10}, ax:{sl:-3}, flags:{REGINALD_PUBLISHED:false}, res:'The books disappear. Reginald does not mention it. He watches the door more than usual. He begins writing something longer.'},
        {lab:'Declare it a dungeon-wide cultural milestone.', hint:'Big morale, small cost.', fx:{fear:12,gold:-5}, ax:{sl:5}, flags:{REGINALD_PUBLISHED:true}, res:'Morale spikes. Two goblins ask if they can also publish poetry. This is now a thing that is happening.'},
      ]},

    { id:'A03', cat:'A', from:'Hilda Grumstone, Head of Security (Status: Disputed)', re:'Retirement Paperwork, Again',
      body:['Hilda\'s retirement paperwork was submitted fourteen months ago and never processed. She continues reporting to her post on the grounds that until it clears, she is technically still employed.',
            'She has expressed opinions about this. To a wall. The wall has developed a crack.'],
      choices:[
        {lab:'Locate and process the paperwork.', hint:'She leaves. Security gap.', fx:{fear:-15,comply:-10,gold:-10}, ax:{sl:-4}, flags:{HILDA_REINSTATED:false}, res:'Hilda\'s retirement is formalised. Security is understaffed. A Troll temp is hired at double rate. The crack in the wall remains, a small monument.'},
        {lab:'Lose the paperwork again, officially.', hint:'Nothing resolves. Fine.', fx:{comply:-5}, flags:{HILDA_PAPERWORK_LOST:true}, res:'Hilda shrugs and returns to her post. Nothing is resolved. This is, everyone agrees, the correct outcome.'},
        {lab:'Promote her to "Consultant (Emeritus)".', hint:'Costs gold. She stays.', fx:{gold:-5,fear:8}, ax:{sl:6}, flags:{HILDA_REINSTATED:true}, res:'This is the most paperwork Hilda has ever seen. She is not pleased. She stays anyway, re-onboarded, now technically Bureaucratic.'},
        {lab:'Ask Grimble to find the paperwork.', hint:'He will. He\'ll invoice.', fx:{gold:-3}, res:'Grimble finds it in eleven minutes. He does not say where it was. He invoices for "special research." The matter proceeds.'},
      ]},

    { id:'A05', cat:'A', from:'Facilities (via Grimble)', re:'Break Room Usage Dispute — Ongoing',
      body:['The break room is now a territorial dispute between the Corridor Four skeletons (who find goblin spreadsheet-talk "acoustically aggressive") and the goblin admin team (who find skeleton rattling "unprofessional"). Both have filed complaints. Grimble filed both, on their behalf, and found the whole thing "clarifying."'],
      choices:[
        {lab:'Designate quiet hours.', hint:'Grudging peace.', fx:{comply:5,fear:6}, res:'Both groups accept the schedule grudgingly. The rattle frequency decreases. Grimble logs your decision as "adequate."'},
        {lab:'Build a second break area.', hint:'Costs gold.', fx:{gold:-12,fear:12,comply:3}, res:'Morale improves. You now have two rooms to manage. Inter-staff friction drops for a while.'},
        {lab:'Mandatory team-building exercise.', hint:'Nobody wants this.', fx:{fear:-5}, ax:{sl:2}, res:'No one wants to do this. They do it anyway. Nothing is resolved but something has shifted, grudgingly, toward cohesion.'},
        {lab:'Ignore it. These things sort themselves out.', hint:'They do not.', fx:{fear:-8}, flags:{STAFF_FRICTION_HIGH:true}, res:'They do not sort themselves out. Tension escalates. Grimble adds a tab.'},
      ],
      roomMod:{room:'lounge', lab:'Send them to the Employee Lounge.', hint:'Neutral ground.', fx:{fear:10}, res:'The lounge provides a neutral third space. The dispute evaporates. This is what lounges are for.'} },

    { id:'A07', cat:'A', from:'Grimble', re:'Inventory Discrepancy — Supply Closet B',
      body:['An audit of Supply Closet B found 340% more ration packs than were ever ordered, several personalised coffee mugs, a cot, and "evidence of sustained habitation." Grimble has not opened the door fully.',
            'One mug says "Brix."'],
      cond:S=>!S.flags.BRIX_DISCOVERED,
      choices:[
        {lab:'Investigate the closet thoroughly.', hint:'Reveals the occupant.', fx:{}, flags:{BRIX_DISCOVERED:true}, res:'The closet\'s resident, an adventurer named Brix, becomes aware that you are aware. She has no particular interest in leaving. A questline, of sorts, begins.'},
        {lab:'Seal it under "unresolved inventory".', hint:'Familiar.', fx:{}, res:'The closet is sealed. The situation is unresolved. This feels familiar. Later, notes begin appearing under your door. They are helpful.'},
        {lab:'Leave a formal memo for the occupant.', hint:'Diplomatic.', fx:{rep:5}, flags:{BRIX_DISCOVERED:true,BRIX_FRIENDLY:true}, res:'By morning the memo has a reply. The handwriting is tidy. Brix is amicable. You have, somehow, gained a friend in a closet.'},
        {lab:'Ask Grimble to handle it.', hint:'He invoices.', fx:{gold:-5}, flags:{BRIX_DISCOVERED:true}, res:'Grimble handles it, neutrally, and invoices for "sensitive personnel matters."'},
      ]},

    { id:'A08', cat:'A', from:'Operations', re:'Werewolf Staff — Lunar Calendar Compliance',
      body:['The scheduling grid does not account for the lunar cycle. Werewolf staff have been rostered for full-moon night shifts three months running. HR notes the resulting incidents were "not technically the employees\' fault."',
            'The recommendation is on page forty of a forty-three-page report. Grimble has summarised it in two sentences.'],
      cond:S=>S.staff.some(s=>s.type==='Werewolf'),
      choices:[
        {lab:'Implement lunar-adjusted scheduling.', hint:'Coverage dips briefly.', fx:{fear:5,comply:8}, ax:{sl:3}, res:'Werewolf staff are visibly relieved and gain lasting loyalty. Night coverage dips for a week. Worth it.'},
        {lab:'Hire staff to cover blackout periods.', hint:'Costs gold, +1 staff.', fx:{gold:-15,fear:8,comply:5}, hire:true, res:'New coverage is processed. Gold decreases noticeably. A new face appears on the roster.'},
        {lab:'Install a lunar calendar, self-manage.', hint:'Cheap, workable.', fx:{comply:5,fear:2}, res:'This works better than expected. Three goblins complain the calendar takes up space. A workable peace.'},
        {lab:'File the recommendation, change nothing.', hint:'Something breaks.', fx:{fear:-12,comply:-8,gold:-10}, flags:{WEREWOLF_INCIDENT:true}, res:'Next full moon, something in the east wing is destroyed. HR adds page forty-four.'},
      ]},

    { id:'A09', cat:'A', from:'Pip (Imp, Floor Three)', re:'Notice of Intent to Organise, Statute 12(c)',
      body:['The Floor Three imps have filed notice of intent to unionise. Demands: regulated fire-spitting hours, a resting perch per shift, recognition of "ambient chaos generation" as skilled labour, and kettle access. Grimble noted in the margin: "some of these are reasonable."'],
      cond:S=>!S.flags.UNION_FORMED,
      choices:[
        {lab:'Recognise and negotiate in good faith.', hint:'Costs gold. Big morale.', fx:{gold:-5,fear:12,comply:8}, ax:{sl:6}, flags:{UNION_FORMED:true}, res:'The imps are cautiously hopeful. Morale spills over to other staff. Local 7 is real now, and favourable.'},
        {lab:'Reject on procedural grounds.', hint:'They refile.', fx:{comply:5,fear:-10}, ax:{sl:-4}, flags:{UNION_FORMED:true}, res:'They refile, correctly, with more footnotes. The union forms anyway, adversarially.'},
        {lab:'Invite Pip for tea, informally.', hint:'Resolves grievances.', fx:{fear:8,comply:5,rep:5}, ax:{ga:3}, res:'Pip attends. The conversation lasts three hours. Kettle access is granted immediately. Several things are quietly resolved.'},
        {lab:'Escalate to the Dark Lord.', hint:'Silence reads as hostility.', fx:{fear:-8}, dl:5, flags:{UNION_FORMED:true}, res:'No response for two weeks. The imps interpret the silence as hostility. They are not entirely wrong.'},
      ]},

    { id:'A11', cat:'A', from:'Occupational Wellbeing (Grimble)', re:'Grief Counselling Services, Banshee Staff',
      body:['The banshee contingent has formally requested grief counselling. Their role requires "sustained expression of despair," which is "emotionally adjacent to personal experience." The current provision is a pamphlet titled *You Are Doing Great, Probably*.',
            'Morvessa screams differently on Wednesdays now. HR considers this significant.'],
      cond:S=>S.staff.some(s=>s.type==='Banshee'),
      choices:[
        {lab:'Commission a qualified counsellor.', hint:'Costs gold. Big morale.', fx:{gold:-10,fear:15,comply:8}, ax:{sl:4}, res:'The screaming changes character. Staff in adjacent corridors report feeling oddly understood. Loyalty rises across the board.'},
        {lab:'Expand the pamphlet to two pages.', hint:'Cheap, partial.', fx:{gold:-2,fear:5,comply:3}, res:'Grimble writes it. It is very good. Morvessa screams at it for forty minutes and then seems slightly better.'},
        {lab:'Create a peer support group.', hint:'Free, warm.', fx:{fear:10,comply:3}, ax:{sl:3}, flags:{STAFF_COHESION_HIGH:true}, res:'Attendance is unexpectedly high. A zombie attends and does not speak but returns every week. Cohesion improves.'},
        {lab:'Decline — "within normal parameters".', hint:'She escalates.', fx:{fear:-12,comply:-5}, res:'Morvessa submits a fifteen-page addendum. A neighbouring facility will file a noise complaint before long.'},
      ]},

    // ---- Category B: Adventurer Incursions ----
    { id:'B01', cat:'B', from:'Hilda Grumstone (Status: Disputed)', re:'Incursion Report — Party of Four, East Gate',
      body:['A party of four entered at 0800: enchanted weapons, a hand-drawn map twenty years out of date, matching cloaks of the Adventurers\' Guild, Western Chapter. Their stated purpose, left in a note at the guard post: "to slay the evil within." They have a paladin. Hilda considers this "relevant."',
            'Classic Heroes · motivation: Slay the Evil (specifically, you).'],
      choices:[
        {lab:'Deploy standard defences.', hint:'Damage, but morale + rep.', fx:{gold:-15,fear:8,rep:10,comply:1}, res:'Considerable noise. Some property damage. The dungeon lives up to its reputation, which is the entire point of a dungeon.'},
        {lab:'Send a letter requesting they reschedule.', hint:'Confusing to them.', fx:{fear:-3,rep:5,comply:3}, res:'They do not reschedule, but they pause in genuine confusion for several minutes. The story gets around. It helps.'},
        {lab:'Negotiate paid passage of one area.', hint:'Gold, but looks like capitulation.', fx:{gold:15,rep:-8,fear:5}, flags:{ADV_SYMPATHY:5}, res:'Two agree; the paladin does not. Word of capitulation spreads. You have gold and a slightly softer reputation.'},
        {lab:'Full trap systems as an operational test.', hint:'Variable. Big morale if it works.', fx:{gold:-8,fear:12,comply:5}, res:'The traps perform variably. The archer disarms one by accident. The mage seems to enjoy one. The performance log is, at least, thorough.'},
      ]},

    { id:'B02', cat:'B', from:'Grimble', re:'Unscheduled Visitors, Corridor Three',
      body:['Two individuals were found arguing about a map — a map of a different dungeon entirely, decommissioned in the Year of the Blighted Harvest. Mismatched armour, a torch already gone out, "a general plan." They do not appear to be a threat. They appear to be lost.',
            'Budget Adventurers · motivation: Wrong Turn.'],
      choices:[
        {lab:'Escort them out safely.', hint:'Kindness noted.', fx:{rep:5}, flags:{ADV_SYMPATHY:3}, res:'They thank you and leave. One takes a souvenir. Grimble inventories it and flags it. Word gets around that you were decent about it.'},
        {lab:'Process them through standard intake.', hint:'Tedious. Small fee.', fx:{comply:5,fear:-3,gold:5}, res:'The intake form is twenty-two pages. One asks if there is a shorter version. There is not.'},
        {lab:'Offer them employment.', hint:'+1 staff. Onboarding cost.', fx:{gold:-5,fear:5}, hire:true, flags:{ADVENTURER_EMPLOYEE:true}, res:'They are surprised. They discuss it quietly. One says yes. The roster grows by one confused but willing soul.'},
        {lab:'Leave them in Corridor Three.', hint:'They find the exit.', fx:{rep:3}, res:'They eventually find the exit and leave a review: "surprisingly navigable once you find the signs." You do not have signs. You make a note to get signs.'},
      ]},

    { id:'B03', cat:'B', from:'Grimble', re:'Corporate Incursion — ChaosKeep™ Operatives',
      body:['Three individuals in matching tactical gear, noise-cancelling ear protection, and a clipboard. One photographed the Armory. One asked Hilda whether the dungeon offered a "competitor benchmarking programme." Hilda responded. That operative is currently in the Infirmary.',
            'Corporate Spies (ChaosKeep™) · motivation: industrial intelligence.'],
      cond:S=>!S.flags.CHAOSKEEP_RIVALRY,
      choices:[
        {lab:'Detain and interrogate them.', hint:'Escalates the rivalry.', fx:{comply:5,fear:8}, flags:{CHAOSKEEP_RIVALRY:true}, res:'They are cooperative in a rehearsed way. They confirm they are ChaosKeep™. They do not confirm what they wanted. The espionage arc begins.'},
        {lab:'Expel them, send a cease-and-desist.', hint:'Clean, still a rivalry.', fx:{comply:3,rep:5}, flags:{CHAOSKEEP_RIVALRY:true}, res:'They leave efficiently. The cease-and-desist is acknowledged but not replied to. This is how rivalries begin: politely.'},
        {lab:'Arrange an unofficial meeting.', hint:'Détente. Biscuits.', fx:{}, ax:{ga:1}, flags:{CHAOSKEEP_NEGOTIATION:true}, res:'The meeting is in a neutral location. Someone brings biscuits. Nothing is resolved but the tone is collegial. For now.'},
        {lab:'Trade a tour for their benchmarking notes.', hint:'Gold + intel.', fx:{gold:10,comply:8}, flags:{CHAOSKEEP_RIVALRY:true,CHAOSKEEP_NOTES:true}, res:'They pay the tour fee. Their notes reveal two genuine infrastructure gaps and are somewhat insulting. You now have an intelligence advantage.'},
      ]},

    { id:'B05', cat:'B', from:'Grimble', re:'Content Creators, Portal Side Entrance',
      body:['Five individuals with recording equipment, ring lights, and what one described as "a vibe." A channel with a significant following. They are here to complete a challenge: "Surviving the Night in a Real Dungeon." They have signed no waivers. Zara has asked if she can be in the video. Grimble said no, preemptively.',
            'Influencers · motivation: Complete a Dare.'],
      choices:[
        {lab:'Remove them as a security incident.', hint:'Goes viral. Badly.', fx:{rep:-10,comply:5}, flags:{INFLUENCER_INCIDENT:true}, res:'They livestream the removal. It gets significant engagement. Not the kind you wanted.'},
        {lab:'Assign a staff escort, set ground rules.', hint:'Wholesome content.', fx:{rep:12,fear:5,gold:-3}, flags:{ADV_SYMPATHY:5}, res:'The escort (a goblin named Twitch) is quietly terrified and completely professional. The resulting video is strangely wholesome.'},
        {lab:'Charge an access fee, make it a formal event.', hint:'Gold + rep.', fx:{gold:15,rep:8,comply:3}, res:'They pay with genuine surprise. You are briefly on camera. You look exactly how you look. Zara is in the background of one shot despite everything.'},
        {lab:'Activate theatrical elements for the recording.', hint:'Big rep, some cost.', fx:{rep:18,gold:-8,fear:5}, dl:-3, res:'The dungeon delivers. The video is extremely good. Several monsters become briefly famous. There is a 1-in-5 chance the Dark Lord sees it.'},
      ]},

    { id:'B06', cat:'B', from:'Grimble', re:'Lost Party — Touring Group',
      body:['Nine adults and two children in the main atrium with a printed itinerary for "Moswick\'s Scenic Cavern Trail (Self-Guided)." There is no such trail. The Visitor Bureau confirms it issued the itinerary and notes the trail has been "temporarily relocated" to this site "pending a mapping update."'],
      choices:[
        {lab:'Offer a guided tour, lean in.', hint:'Delighted tourists.', fx:{rep:12,gold:5}, flags:{ADV_SYMPATHY:3,TOURIST_FRIENDLY:true}, res:'The tourists are delighted. The children enjoy the goblins. The goblins are conflicted, then quietly moved.'},
        {lab:'Arrange proper extraction via the Bureau.', hint:'Correct, slow.', fx:{comply:8,rep:5,fear:-3}, res:'Extraction takes four hours. The Bureau is apologetic. A formal liaison is discussed. Everything is documented.'},
        {lab:'Refreshments, souvenirs, polite exit.', hint:'Cheap, warm.', fx:{gold:-5,rep:10,fear:5}, res:'This works extremely well. The children take home goblin-made keychains. Two goblins are moved. Low cost, high return.'},
        {lab:'Pursue a formal complaint against the Bureau.', hint:'Grimble is thrilled.', fx:{comply:8,gold:5,rep:-3}, res:'Grimble handles the complaint with evident enthusiasm. There will be an eventual settlement. The public record acquires a legal tone.'},
      ]},

    { id:'B08', cat:'B', from:'Hilda Grumstone (Status: Disputed)', re:'Incursion — Two Individuals, East Servant Corridor',
      body:['Two individuals entered on a bet involving touching "the skull room" (the Ossuary, which is not a skull room) and returning with evidence. One has a wager receipt. It is for four silver pieces. Hilda finds this personally insulting.',
            'Budget Adventurers · motivation: Complete a Dare.'],
      choices:[
        {lab:'Escort them to the Ossuary for the photo.', hint:'Grassroots rep.', fx:{rep:5,gold:-2}, flags:{ADV_SYMPATHY:2}, res:'They are thrilled. They post about it. The post is positive and extremely informal. Hilda\'s mood improves at being taken seriously.'},
        {lab:'Fine the bet originator for trespassing.', hint:'Gold, feels mean.', fx:{gold:8,comply:3,rep:-5}, res:'The fine amount confuses everyone involved. The originator pays it. Word gets out that you fine people over dares.'},
        {lab:'Expand it into a structured challenge event.', hint:'Gold + rep.', fx:{gold:10,rep:8,fear:5}, flags:{CHALLENGE_EVENT:true}, res:'They sign everything and the challenge is genuinely fun. Staff enjoy it. This could become a recurring attraction.'},
        {lab:'Let Hilda handle it.', hint:'They leave fast.', fx:{fear:5,rep:-5}, res:'Hilda handles it. They leave very quickly and do not come back. The account they give later is vivid.'},
      ]},

    // ---- Category C: Dark Lord Communications ----
    { id:'C01', cat:'C', from:'Office of Vormax the Unceasing', re:'Quarterly Performance — Preliminary Observations', quote:true,
      body:['*Gerald,*',
            '*I have reviewed the operational summary. I note several items of concern, which I will enumerate whenever I next remember to send a follow-up.*',
            '*The dungeon\'s Fear metrics are, and I use this word deliberately, present. Whether they are present at an appropriate level is a question I leave to your reflection.*',
            '*— V*'],
      choices:[
        {lab:'Send a detailed report preemptively.', hint:'Compliance, DL warms slightly.', fx:{comply:5}, dl:-3, res:'The report is acknowledged with a one-word reply: "Fine." This is, by Vormax\'s standards, encouraging.'},
        {lab:'Acknowledge, ask about targets.', hint:'Neutral.', fx:{comply:3}, res:'The question goes unanswered for eleven days. Then a memo clarifies that targets are "self-evident." Grimble notes they specify no numbers.'},
        {lab:'Ignore the memo.', hint:'Builds displeasure.', fx:{}, dl:5, res:'Nothing happens immediately. Nothing ever happens immediately. It accumulates.'},
        {lab:'Have Grimble draft a response.', hint:'He invoices. DL warms.', fx:{gold:-3}, dl:-5, res:'Grimble\'s response is seventeen pages and meticulous. Vormax\'s office replies that it was "more than necessary but noted."'},
      ]},

    { id:'C04', cat:'C', from:'Office of Vormax the Unceasing', re:'Annual Dark Lord\'s Vision Address (Abridged)', quote:true,
      body:['*Colleagues,*',
            '*The dungeon exists to serve its purpose. Its purpose is known. Those who know it are to continue knowing it. Those who do not should consult their onboarding materials, updated by someone named Grimble.*',
            '*Excellence is expected. Adequate performance is acceptable. Anything below adequate is a conversation I will have with Gerald.*',
            '*— Vormax the Unceasing*'],
      choices:[
        {lab:'Distribute with a positive framing memo.', hint:'Mild reassurance.', fx:{fear:5,comply:3}, res:'Staff read it. The goblins have questions. The skeletons consider it carefully. Grimble notes you handled the messaging "adequately."'},
        {lab:'Hold a staff meeting to discuss the vision.', hint:'Engagement, some chaos.', fx:{fear:8,comply:-3}, ax:{sl:3}, flags:{STAFF_COHESION_HIGH:true}, res:'The meeting is three hours long. Three things are clarified. Many more are raised. Confused engagement is still engagement.'},
        {lab:'File it, take no action.', hint:'Quiet.', fx:{comply:3}, res:'The transcript is filed. Staff talk amongst themselves. What they say is recorded in Grimble\'s next summary.'},
        {lab:'Ask Vormax to clarify "the purpose".', hint:'Due diligence.', fx:{comply:3}, res:'The response arrives two weeks later. It is two words. One of them is "yes." Grimble files it under "Strategic Direction."'},
      ]},

    { id:'C05', cat:'C', from:'Office of Vormax the Unceasing', re:'Compliance Audit Notice — External Review', quote:true,
      body:['*Gerald,*',
            '*The Dungeon Regulatory Authority will conduct its biennial review in four weeks. I have not replied to their scheduling request. I have not replied to the previous three either. The reviewers are, I am told, persistent.*',
            '*I trust your preparations will be thorough. — V*'],
      choices:[
        {lab:'Comprehensive compliance preparation.', hint:'Costs gold. Big compliance.', fx:{gold:-10,comply:20}, dl:-5, res:'Grimble mobilises. The dungeon is audited internally. Several things are found. The Review will go much better for this.'},
        {lab:'Prepare the most likely areas only.', hint:'Targeted.', fx:{gold:-5,comply:10}, res:'Targeted preparation. Several things are not found. The Review may surface what was skipped.'},
        {lab:'Reply and reschedule on Vormax\'s behalf.', hint:'Buys time.', fx:{comply:5,gold:5}, res:'The DRA accepts the rescheduling. You have bought three weeks. Grimble is impressed you replied at all.'},
        {lab:'Ask Vormax what the DRA flagged before.', hint:'Priorities.', fx:{comply:3}, res:'Vormax\'s response is a very long list, including items from a prior occupant\'s tenure. It gives you specific priorities, at least.'},
      ]},

    { id:'C06', cat:'C', from:'Office of Vormax the Unceasing', re:'Personal Matter — Not For Distribution', quote:true,
      body:['*Gerald,*',
            '*I received a birthday card from the staff. I did not know I had a date. It was signed by forty-three individuals. One signature is a drawing of a skeleton holding a small flower, which I am choosing to interpret positively.*',
            '*I would like to acknowledge this appropriately and not embarrassingly. If you tell Grimble I wrote this, I will know. — V*'],
      choices:[
        {lab:'Organise a brief all-staff acknowledgement.', hint:'Warmth spreads.', fx:{fear:12}, dl:-8, flags:{VORMAX_SOFTENING:true}, res:'Vormax\'s message is brief, formal, and unexpectedly sincere. Staff are moved. Something softens in the Dark Lord that will matter at the Review.'},
        {lab:'Suggest he send a thank-you memo.', hint:'Registers.', fx:{fear:7}, dl:-4, res:'The memo arrives. It is exactly what one would expect. The gesture registers regardless.'},
        {lab:'Advise the card was sufficient.', hint:'The moment passes.', fx:{fear:3}, res:'Vormax seems relieved. No further communication on the subject. The moment passes without complication.'},
        {lab:'Tell Grimble.', hint:'He already knows.', fx:{fear:5}, dl:5, res:'Grimble says "I know" and produces the card-organising committee\'s planning document. Vormax asked you specifically not to. Vormax will know.'},
      ]},

    { id:'C11', cat:'C', from:'Office of Vormax the Unceasing', re:'RE: The Dragon Roost Proposal', quote:true,
      body:['*Gerald,*',
            '*I am not instructing you to build a Dragon Roost. I am simply noting that I would find it interesting if you did. These are not the same thing.*',
            '*P.S. If you do, ensure a separate ventilation system. The previous one was not separate enough. — V*'],
      cond:S=>!S.rooms.includes('dragon'),
      choices:[
        {lab:'Commit to building it.', hint:'DL warms a lot.', fx:{}, dl:-8, flags:{DRAGON_QUEUED:true}, res:'Vormax replies with what appears to be enthusiasm, formatted as neutrality. The Dragon Roost is smiled upon.'},
        {lab:'Request a feasibility assessment.', hint:'Buys time.', fx:{comply:5}, dl:-2, res:'Vormax says "reasonable." He has never done a feasibility assessment for anything, ever. No commitment made.'},
        {lab:'Decline, citing the ventilation note.', hint:'Mild disappointment.', fx:{}, dl:5, res:'Vormax replies: "The note was advisory, not prohibitive. But noted." This will come up again.'},
        {lab:'Ask for his dragon specifications directly.', hint:'He has opinions.', fx:{comply:3}, dl:-5, flags:{DRAGON_SPEC:true}, res:'Vormax\'s reply is the longest he has ever sent. He has strong opinions about dragons. He enjoyed writing it enormously.'},
      ]},

    // ---- Category D: External Affairs ----
    { id:'D01', cat:'D', from:'Grimble', re:'Supplier Notice — Dungeon Essentials Co.',
      body:['Dungeon Essentials Co. reports a six-week supply disruption due to "an incident involving a client facility in the northern region." They offer a 12% discount on future orders. Grimble notes that twelve percent of nothing remains nothing, and has identified two alternative suppliers.'],
      choices:[
        {lab:'Switch to alternative suppliers.', hint:'Small cost, restored supply.', fx:{gold:-5,fear:5}, flags:{TORCH_SHORTAGE:false}, res:'The switch is processed. One supplier has goblins, which the staff appreciate. Supply is restored.'},
        {lab:'Negotiate better compensation.', hint:'Gold, brief gap.', fx:{gold:5}, res:'Grimble raises the compensation to eighteen percent. There is a three-week supply gap before alternatives activate. He is quietly proud.'},
        {lab:'Audit inventory for efficiencies.', hint:'Finds hidden stock.', fx:{comply:8,gold:5}, res:'The audit finds significant hoarding. Several "missing" things are found. Records improve. No new spending required.'},
        {lab:'Play both suppliers against each other.', hint:'Long-term savings.', fx:{gold:-3}, res:'Grimble is deeply invested. He has a clipboard. The result is a long-term contract at −20%. He adds "procurement expertise" to his self-assessment.'},
      ]},

    { id:'D02', cat:'D', from:'Grimble', re:'Diplomatic Overture — Mirefen Hollow',
      body:['A polite border dispute from Mirefen Hollow, twelve kilometres east. Operations Director Threl asserts two trap corridors cross a surveyed boundary by "approximately four metres," causing "adventurer confusion and attribution difficulties." They propose a joint review. They included a gift basket.'],
      choices:[
        {lab:'Accept the boundary review graciously.', hint:'Diplomacy, small cost.', fx:{comply:8,rep:8,gold:-5,fear:5}, flags:{MIREFEN_ALLIED:true}, res:'The line is redrawn; three traps are marginally relocated. Mirefen becomes a minor positive presence. Regional diplomacy is noted.'},
        {lab:'Dispute the claim with a counter-survey.', hint:'Chilly.', fx:{comply:3,rep:-5}, res:'The dispute is civil but chilly. Mirefen becomes mildly frosty. Minor friction ahead.'},
        {lab:'Propose a non-interference agreement.', hint:'Clean.', fx:{comply:5,rep:5}, res:'Threl accepts. Neither facility poaches the other\'s adventurers. Mirefen becomes a passive, positive presence.'},
        {lab:'Accept the basket, schedule for later.', hint:'Free. Cheese.', fx:{fear:3,rep:3}, res:'The gift basket is distributed. The goblin admin team rates the cheese highly. The boundary issue is deferred, pleasantly.'},
      ]},

    { id:'D06', cat:'D', from:'Grimble', re:'Adventurers\' Guild — Formal Complaint',
      body:['The Guild (Western Chapter) complains of "inconsistent engagement protocols," "unexplained administrative delays," and one member offered employment "without an appropriate cooling-off period." They are copying the DRA. Grimble rates the complaint "substantively mixed."'],
      choices:[
        {lab:'Respond formally, address each point.', hint:'Solid.', fx:{comply:10,rep:5}, flags:{ADV_SYMPATHY:3}, res:'The response is thorough. The Guild acknowledges it with moderate satisfaction. Regulatory pressure eases.'},
        {lab:'Meet the Guild to discuss protocols.', hint:'Best outcome.', fx:{comply:8,rep:12}, flags:{ADV_SYMPATHY:5,GUILD_AGREEMENT:true}, res:'Both sides are professional. An informal protocol agreement is reached. Incursions are less likely to escalate now.'},
        {lab:'Counter-file about unannounced adventurers.', hint:'Bold, costly to rep.', fx:{comply:5,rep:-8}, flags:{ADV_SYMPATHY:-5}, res:'The Guild\'s legal representative responds. This was apparently not a path they expected. Grimble finds it professionally interesting.'},
        {lab:'Invite a supervised "standard incursion" test.', hint:'Costs gold, big rep.', fx:{comply:12,rep:15,gold:-5}, flags:{ADV_SYMPATHY:8,GUILD_PARTNERSHIP:true}, res:'The test runs smoothly. The debrief is constructive. A genuine partnership forms.'},
      ]},

    { id:'D07', cat:'D', from:'Grimble', re:'Charitable Request — Bonewick Orphanage',
      body:['The Bonewick Orphanage requests to host "Brave the Dungeon Night," a supervised family-friendly evening tour. Revenue supports the orphanage. Grimble notes the community\'s perception of the dungeon is currently "cautious," and that the director\'s letter is the politest thing he has ever processed.'],
      choices:[
        {lab:'Host it with full staff engagement.', hint:'Big goodwill.', fx:{rep:15,fear:5,gold:-5}, ax:{ga:3}, flags:{ADV_SYMPATHY:5,COMMUNITY_GOODWILL:true}, res:'Seventeen children are briefly very frightened in a fun way. The dungeon raises funds and genuine local goodwill.'},
        {lab:'A smaller, controlled version.', hint:'Solid.', fx:{rep:8,fear:3,gold:-2}, flags:{ADV_SYMPATHY:3}, res:'The smaller event runs well. The director writes a thank-you note. Grimble frames it.'},
        {lab:'Decline, donate instead.', hint:'Quiet.', fx:{gold:-5,rep:5}, res:'The donation is appreciated. The event is not hosted. The dungeon is not seen. An opportunity, gently lost.'},
        {lab:'Propose it as an annual tradition.', hint:'Costs now, pays later.', fx:{rep:18,fear:8,gold:-5}, ax:{ga:3}, flags:{ANNUAL_EVENT:true,ADV_SYMPATHY:5}, res:'The director says yes immediately. You can hear it in the reply letter. Recurring goodwill secured.'},
      ]},

    { id:'D10', cat:'D', from:'Grimble', re:'Competitor — ChaosKeep™ Grand Opening',
      body:['ChaosKeep™ Premium Experience™ has opened four kilometres away, promising "best-in-class dungeon experiences" and "a fully stocked artisanal Dungeon Café." Grimble calls the café "a cynical touch." The goblin admin team would like to know if the café is hiring.'],
      choices:[
        {lab:'Strategic differentiation campaign.', hint:'Costs gold, big rep.', fx:{gold:-5,rep:10}, flags:{CHAOSKEEP_RIVALRY:true,DIFFERENTIATION:true}, res:'The dungeon\'s authentic character is positioned against ChaosKeep™\'s polish. It resonates, unexpectedly.'},
        {lab:'Monitor without public response.', hint:'Lose a little share.', fx:{rep:-5}, flags:{CHAOSKEEP_RIVALRY:true}, res:'Adventurer traffic shifts slightly. Incursion frequency will dip. You watch, and wait, which is its own strategy.'},
        {lab:'Propose a referral arrangement.', hint:'Gold + détente.', fx:{gold:5,rep:3}, flags:{CHAOSKEEP_NEGOTIATION:true}, res:'ChaosKeep™ is surprised. The conversation is wary but not hostile. A temporary détente holds.'},
        {lab:'Have Grimble find their genuine gaps.', hint:'Improvement plan.', fx:{comply:8,gold:-3}, res:'His report is twenty-two pages with a competitive matrix. Two real improvement areas are identified. Addressing them will pay off.'},
      ]},

    { id:'D12', cat:'D', from:'Grimble', re:'Award Nomination — Regional Dungeon Excellence Awards',
      body:['The dungeon has been nominated for the Staff Wellbeing award, apparently based on an academic citation, the Reginald interview, and Morvessa\'s online activity. There is a small entry fee. First place gets a trophy and regional recognition. Reginald has already asked if there will be a ceremony.'],
      cond:S=>S.week>=6,
      choices:[
        {lab:'Confirm and attend the ceremony.', hint:'Costs gold, big rep + morale.', fx:{gold:-5,rep:15,fear:10}, dl:-5, res:'You say very little. Reginald says exactly the right amount. The dungeon places creditably. Vormax notes the achievement.'},
        {lab:'Confirm, send Reginald as representative.', hint:'Moving.', fx:{gold:-3,rep:10,fear:8}, res:'Reginald delivers a short acceptance remark. It is, despite everything, quite moving. If he\'s published, he reads a poem.'},
        {lab:'Decline — "not seeking recognition".', hint:'Elegant, cold.', fx:{rep:3,fear:-10}, res:'The statement is elegant. Reginald reads it three times, says nothing, and returns to his desk. His disappointment is quiet and total.'},
        {lab:'Use it as an internal morale event.', hint:'Big morale.', fx:{fear:15,rep:8,gold:-3}, flags:{STAFF_COHESION_HIGH:true}, res:'The response is disproportionately warm. Grimble tells no one he is pleased but is visibly pleased.'},
      ]},

    // ---- Category E: Dungeon Mysteries ----
    { id:'E01', cat:'E', from:'Grimble', re:'Anomalous Readings — Corridor Seven',
      body:['The temperature in Corridor Seven has dropped fourteen degrees over three weeks. Consistent, gradual, no mechanical cause. Staff report "a feeling of being considered." Reginald\'s office is in Corridor Seven. Reginald has not mentioned the temperature.'],
      choices:[
        {lab:'Commission a full environmental survey.', hint:'Documents it.', fx:{comply:8,fear:3}, flags:{CORRIDOR_SEVEN:true}, res:'No mechanical cause is found. The phenomenon is documented. Something in Corridor Seven will change, later.'},
        {lab:'Ask Reginald directly.', hint:'He is calm.', fx:{fear:5}, flags:{REGINALD_AWARE:true}, res:'Reginald pauses. "It is colder than it was," he says, and returns to his work. His calm is both reassuring and not.'},
        {lab:'Increase the heating, call it a facilities issue.', hint:'Masks it.', fx:{gold:-3}, flags:{CORRIDOR_SEVEN:true}, res:'The corridor warms. The feeling of being considered diminishes but does not stop. It will resurface, stronger.'},
        {lab:'Station a guard and monitor quietly.', hint:'Nothing, for now.', fx:{gold:-3}, flags:{CORRIDOR_SEVEN:true}, res:'The guard reports "a lot of just standing there, honestly." Nothing happens for two weeks. Then the guard has something specific to report.'},
      ]},

    { id:'E05', cat:'E', from:'Grimble', re:'RE: The Singing (Day 12)',
      body:['Grimble\'s twelfth memo on the subject. The singing originates from below Floor Three, from a section not in any blueprint. It is not unpleasant. Reginald describes the language as "archaic but locally sourced." He has said he will translate it. He has not.'],
      choices:[
        {lab:'Commission a structural survey.', hint:'Finds the chamber.', fx:{comply:5}, flags:{SUBLEVEL_CHAMBER:true}, res:'The team maps a chamber. It exists. It is old. The singing continues while they work. It is now, at least, on the record.'},
        {lab:'Have Reginald translate first.', hint:'He withholds part.', fx:{fear:8}, flags:{SUBLEVEL_CHAMBER:true,REGINALD_AWARE:true}, res:'What Reginald shares: it is an administrative song. What he withholds: what it is administering. He is handling this carefully, which is somehow reassuring.'},
        {lab:'Attempt to communicate with it.', hint:'It responds.', fx:{fear:10}, flags:{SUBLEVEL_CHAMBER:true,CONTACT_MADE:true}, res:'The thing responds, which is terrifying and also fine. Grimble writes "confirmed" in a very specific way. A negotiation may be required.'},
        {lab:'Seal the access points.', hint:'It continues.', fx:{comply:3}, res:'The access points are sealed. The singing continues, unchanged. It was never coming through the walls.'},
      ]},

    { id:'E09', cat:'E', from:'Grimble', re:'The Plant',
      body:['There is a plant in the main atrium that was not there last week. Four feet tall, excellent health, potted to match the décor, with a card reading "For the dungeon." Unsigned. No delivery logged. Zara says she did not raise it. It appears to be a fern. It is a very good fern.'],
      choices:[
        {lab:'Investigate its origin.', hint:'No answer.', fx:{comply:3}, flags:{UNEXPLAINED_GIFT:true}, res:'No delivery record, no entry log, no source. The plant remains. It continues to be healthy. It does not do anything. It is simply there.'},
        {lab:'Accept and display it prominently.', hint:'Small joy.', fx:{rep:8,fear:5}, flags:{UNEXPLAINED_GIFT:true}, res:'The plant becomes a point of pride. Visitors mention it. Grimble waters it on a schedule. The dungeon feels, briefly, cared for.'},
        {lab:'Remove it until explained.', hint:'It comes back.', fx:{fear:-3}, flags:{UNEXPLAINED_GIFT:true}, res:'The next morning there is a second, smaller plant in the same spot. By and by there are seven. All healthy. All ferns.'},
        {lab:'Water it, leave a thank-you note.', hint:'Oddly warm.', fx:{fear:10}, flags:{UNEXPLAINED_GIFT:true,CONTACT_ACK:true}, res:'By morning the note is gone. A new plant appears in the break room a week later. The exchange is oddly warm. They do not spread beyond reasonable decoration.'},
      ]},

    { id:'E10', cat:'E', from:'Grimble', re:'The Counting',
      body:['The weekly headcount returns forty-seven. The register contains forty-six. Grimble has counted three times, by department. Forty-seven. Entry, exit, and Infirmary logs all say forty-six. The extra individual appears in headcounts but not in any document — "present, quiet, and in the general area of Corridor Seven more often than not."'],
      cond:S=>S.week>=8,
      choices:[
        {lab:'Attempt to register them formally.', hint:'They\'re in the register now.', fx:{comply:5}, flags:{FORTY_SEVENTH:true}, res:'A registration form left near Corridor Seven is filled out by morning. The name is illegible but the form is complete. Morale there is inexplicably stable.'},
        {lab:'Consult Reginald about Corridor Seven.', hint:'He knew.', fx:{fear:10}, flags:{FORTY_SEVENTH:true,REGINALD_AWARE:true}, res:'Reginald listens, is quiet, and says: "I wondered when you would notice." He is not afraid. He provides a partial history.'},
        {lab:'Accept it as an administrative anomaly.', hint:'No fuss.', fx:{comply:3}, flags:{FORTY_SEVENTH:true}, res:'The forty-seventh appears to appreciate the lack of fuss. No further anomaly from their presence. The headcount stays at forty-seven.'},
        {lab:'Ask Hilda to locate them.', hint:'Inconclusive, tidy.', fx:{comply:5}, flags:{FORTY_SEVENTH:true}, res:'Hilda finds no one, but evidence of someone. Wherever they are, they have been "keeping the east wing very tidy." You re-read this sentence twice.'},
      ]},

    { id:'E06', cat:'E', from:'Grimble', re:'Anomaly Report — Mirror in Staff Corridor B',
      body:['The mirror in Staff Corridor B shows the corridor as it will appear about thirty seconds in the future. Discovered when Hilda walked past, saw herself walk past from the other direction, and filed a report immediately. It has been doing this for three weeks. No one mentioned it until Hilda.'],
      choices:[
        {lab:'Remove it for arcane assessment.', hint:'Disorienting week.', fx:{comply:5,fear:-3}, res:'Staff in Corridor B feel slightly disoriented without it. The assessment returns findings later. It may be reinstated as a tool.'},
        {lab:'Leave it, establish a usage protocol.', hint:'Useful precognition.', fx:{comply:3,fear:8}, flags:{FUTURE_MIRROR:true}, res:'Hilda uses it every morning and finds it "efficient." Staff find the mild precognition reassuring for navigation. The window will extend.'},
        {lab:'Have Zara study it.', hint:'She is delighted.', fx:{fear:5}, flags:{FUTURE_MIRROR:true}, res:'Zara sets up a research station and spends a great deal of time looking at herself. If the Tuesday anomaly is active, the two appear linked.'},
        {lab:'Have Grimble use it for scheduling.', hint:'Ops improvement.', fx:{comply:8,fear:5}, flags:{FUTURE_MIRROR:true}, res:'It works, within the thirty-second window. Grimble does not say "I told you so" because he did not, but he looks like he might.'},
      ]},
  ];

  const EMERGENCIES = [
    {name:'Equipment Failure', cost:[15,35], note:'A trap, a torch rig, a door that now only opens inward.'},
    {name:'Unauthorized Haunting', cost:[10,25], note:'Something is haunting a supply closet without the proper permits.'},
    {name:'Tax Audit', cost:[30,60], note:'The Empire would like a word about the Q1 filings.'},
    {name:'Staff Injury Claim', cost:[20,45], note:'A delivery troll and a misfiring trap. Forms were filed.'},
    {name:'Dark Lord Surcharge', cost:[40,80], note:'An "operational contribution." Cannot be refused. No options given.'},
  ];

  /* ---------------- state ---------------- */
  let S = null;

  function newState(){
    return {
      view:'title',
      week:1, phase:1,
      gold:350, fear:40, comply:65, rep:50,
      axis:{ds:30, sl:40, dls:50, ga:50},
      meterDL:0,          // Dark Lord displeasure
      bg:null, dl:null, crisis:null,
      staff:[], rooms:[], floors:[],
      availRooms:[], roomCost:{},
      flags:{}, log:[],
      pending:[], usedEvents:[], curEvent:null,
      // failure tracking
      debtWeeks:0, closureWeeks:0, strikeWeeks:0, abandonWeeks:0,
      mutinyScar:false,
      minSL:40,
      collapsed:false,
      // flags for background
      adventurerEase:false, loyaltyEasy:false, freeRoom:null,
      // review
      review:null,
      ended:false,
    };
  }

  /* ---------------- setup ---------------- */
  function rollFloors(){
    const sizes=[3,5,7];
    const quirks = sample(FLOOR_QUIRKS, 4);
    const floors=[];
    for(let i=0;i<4;i++){
      floors.push({ id:['B-9','B-10','B-11','B-12'][i], slots: pick(sizes), quirk: quirks[i], unlocked: i===0 });
    }
    return floors;
  }
  function rollRooms(){
    // Tier1 all; Tier2 4/6; Tier3 3/6; Tier4 1/3
    const byTier={1:[],2:[],3:[],4:[]};
    for(const k in ROOMS) byTier[ROOMS[k].tier].push(k);
    let avail=[];
    avail = avail.concat(byTier[1]);
    avail = avail.concat(sample(byTier[2],4));
    avail = avail.concat(sample(byTier[3],3));
    avail = avail.concat(sample(byTier[4],1));
    const cost={};
    for(const k of avail){ const base=ROOMS[k].cost; cost[k]=Math.round(base*(0.85+Math.random()*0.3)); }
    return {avail, cost};
  }
  function genStaff(n, allowRareRep){
    const out=[];
    const rep = allowRareRep!=null?allowRareRep:50;
    const pool = Object.keys(TYPES).filter(t=>TYPES[t].minRep<=rep);
    for(let i=0;i<n;i++){
      const type=pick(pool);
      out.push(makeStaff(type));
    }
    return out;
  }
  function makeStaff(type){
    return { name:genName(), type, role:TYPES[type].role, icon:TYPES[type].icon,
             p:pick(PRIMARY), s:pick(SECONDARY), loyalty: 50 + rint(-10,10) };
  }

  function startGame(){
    S = newState();
    S.bg = pick(BACKGROUNDS);
    S.dl = pick(DARKLORDS);
    S.crisis = pick(CRISES);
    S.floors = rollFloors();
    const r = rollRooms(); S.availRooms=r.avail; S.roomCost=r.cost;
    // Grimble is fixed
    S.staff.push({ name:'Grimble', type:'Goblin', role:'Assistant to the Operations Manager', icon:'📎',
                   p:'Diligent', s:'of excellent handwriting', loyalty:45, fixed:true });
    // starting pool: 3 already employed
    S.staff = S.staff.concat(genStaff(rint(2,3), 30));
    // apply background
    S.bg.apply(S);
    if(S.freeRoom){
      if(S.freeRoom==='hr' && S.availRooms.includes('hr')){ buildRoomSilent('hr'); }
      else { const t1=S.availRooms.filter(k=>ROOMS[k].tier<=2 && !S.rooms.includes(k)); if(t1.length) buildRoomSilent(pick(t1)); }
    }
    clampAll();
    S.view='seeds';
    render();
  }

  function buildRoomSilent(key){
    if(S.rooms.includes(key)) return;
    S.rooms.push(key);
    const r=ROOMS[key];
    if(r.once){ for(const k in r.once) S.axis[k]!==undefined ? S.axis[k]+=r.once[k] : applyRes(k,r.once[k]); }
  }
  function applyRes(k,v){ if(k==='fear')S.fear+=v; else if(k==='comply')S.comply+=v; else if(k==='rep')S.rep+=v; else if(k==='gold')S.gold+=v; }

  /* ---------------- economy tick ---------------- */
  function repMult(){
    const r=S.rep;
    if(r<30) return 0.70; if(r<50) return 0.85; if(r<70) return 1.00; if(r<85) return 1.20; return 1.35;
  }
  function wageTotal(){
    const hasHR=S.rooms.includes('hr');
    let t=0;
    for(const s of S.staff){ let w=TYPES[s.type].wage; if(hasHR) w=Math.floor(w*0.95); t+=w; }
    return t;
  }
  function upkeepTotal(){
    let mult=1; for(const f of S.floors){ if(f.unlocked && f.quirk.upkeep) mult*=f.quirk.upkeep; }
    let t=0; for(const k of S.rooms) t+=ROOMS[k].up;
    return Math.round(t*mult);
  }
  function staffIncome(){
    let t=0; for(const s of S.staff) t+=TYPES[s.type].income;
    return Math.min(60,t);
  }
  function roomIncome(){ let t=0; for(const k of S.rooms) t+=ROOMS[k].inc; return t; }

  function unlockedSlots(){ let n=0; for(const f of S.floors) if(f.unlocked) n+=f.slots; return n; }

  function economyTick(notes){
    // costs first
    const up=upkeepTotal(), wg=wageTotal();
    let deferred=false;
    if(S.gold >= up+wg){
      S.gold -= (up+wg);
    } else {
      // partial — defer what can't be paid; wages unpaid → fear penalty
      const canPay=Math.max(0,S.gold);
      S.gold=0; deferred=true;
      notes.push({t:'bad', m:`Could not cover ${up+wg}g in costs. Rooms enter deferred maintenance; some wages unpaid.`});
      S.fear-=4; S.comply-=2;
    }
    // income
    const base=Math.round(PHASE_INCOME[S.phase]*repMult());
    const inc = base + roomIncome() + staffIncome();
    S.gold += inc;
    if(!deferred) notes.push({t:'', m:`Income ${inc}g (base ${base}, rooms ${roomIncome()}, staff ${staffIncome()}). Costs ${up+wg}g (upkeep ${up}, wages ${wg}).`});
    else notes.push({t:'', m:`Income ${inc}g arrived. Reserve rebuilding.`});
    // debt drain
    if(S.gold<0){ S.debtWeeks++; S.gold-=5; }
    else if(S.debtWeeks>0){ S.debtWeeks=0; }
    // passive room effects (per-week)
    for(const k of S.rooms){ const e=ROOMS[k].e; if(e){ if(e.fear)S.fear+=e.fear; if(e.comply)S.comply+=e.comply; if(e.rep)S.rep+=e.rep; } }
    // fear natural decay -2 (slowed by break/ritual already added +1 each via e.fear)
    S.fear-=2;
    // compliance drift -1, plus fear>70 penalty
    S.comply-=1;
    if(S.fear>85) S.comply-=3; else if(S.fear>70) S.comply-=1;
    // reputation penalty if compliance low
    if(S.comply<35) S.rep-=2;
    clampAll();
  }

  function clampAll(){
    S.fear=clamp(Math.round(S.fear),0,100);
    S.comply=clamp(Math.round(S.comply),0,100);
    S.rep=clamp(Math.round(S.rep),0,100);
    S.gold=Math.round(S.gold);
    for(const k in S.axis) S.axis[k]=clamp(Math.round(S.axis[k]),0,100);
    if(S.axis.sl<S.minSL) S.minSL=S.axis.sl;
    if(S.axis.sl<20) S.mutinyScar=true;
  }

  /* ---------------- weekly flow ---------------- */
  function beginWeek(){
    const notes=[];
    // phase unlocks
    const ph=PHASE_OF_WEEK(S.week);
    if(ph!==S.phase){ enterPhase(ph, notes); }
    S.phase=ph;
    if(S.phase===4){ enterReview(); return; }
    economyTick(notes);
    // threshold consequences
    thresholds(notes);
    // emergency ~ 1 in 3-4 weeks
    if(chance(0.28)) emergency(notes);
    // roll events for the week
    S.pending = rollWeekEvents();
    S.weekNotes = notes;
    logWeekly(notes);
    S.view='briefing';
    render();
  }

  function enterPhase(ph, notes){
    // phase completion bonus for finishing previous
    if(ph===2){ S.gold+=100; notes.push({t:'good',m:'Phase 1 complete. +100g Orientation Completion Stipend.'}); if(S.floors[1]) S.floors[1].unlocked=true; }
    if(ph===3){ const ok=S.comply>=40; S.gold+=ok?150:50; notes.push({t:ok?'good':'warn',m:`Phase 2 complete. +${ok?150:50}g Stabilization ${ok?'Assessment Reward':'(reduced — Compliance below 40)'}.`}); if(S.floors[2]) S.floors[2].unlocked=true; if(S.floors[3]) S.floors[3].unlocked=true; }
  }

  function thresholds(notes){
    // Fear low
    if(S.fear<20){ S.strikeWeeks++; if(S.strikeWeeks>=2){ S.gold-=15; notes.push({t:'bad',m:'Staff unrest: strikes spreading. −15g lost productivity.'}); } else notes.push({t:'warn',m:'Fear critically low. Staff have submitted a collective grievance form.'}); }
    else S.strikeWeeks=0;
    // Fear high
    if(S.fear>=86){ const lost=loseStaff(1); notes.push({t:'bad',m:`Fear critical. Mass resignations — ${lost||'no additional'} staff departed.`}); }
    else if(S.fear>=71){ if(chance(0.5)){ const lost=loseStaff(1); if(lost) notes.push({t:'warn',m:'Fear high. A staff member resigned, citing "a bit much."'}); } }
    // Fear zero abandonment
    if(S.fear<=0){ S.abandonWeeks++; } else S.abandonWeeks=0;
    // Reputation zero
    if(S.rep<=0) notes.push({t:'warn',m:'Reputation at rock bottom. Adventurers don\'t even bother. Income halved.'});
  }

  function loseStaff(n){
    let removed=0;
    for(let i=0;i<n;i++){
      const cands=S.staff.filter(s=>!s.fixed && TYPES[s.type].quit<=S.fear);
      const pool = cands.length?cands:S.staff.filter(s=>!s.fixed);
      if(!pool.length) break;
      const victim=pick(pool);
      S.staff.splice(S.staff.indexOf(victim),1); removed++;
    }
    return removed;
  }

  function emergency(notes){
    const e=pick(EMERGENCIES);
    const cost=rint(e.cost[0],e.cost[1]);
    if(e.name==='Dark Lord Surcharge'){ S.gold-=cost; notes.push({t:'bad',m:`Emergency — Dark Lord Surcharge. −${cost}g. No options given.`}); return; }
    // auto-pay if possible, else compliance hit
    if(S.gold>=cost){ S.gold-=cost; S.comply+=2; notes.push({t:'warn',m:`Emergency — ${e.name}. Paid ${cost}g. ${e.note}`}); }
    else { S.comply-=5; notes.push({t:'bad',m:`Emergency — ${e.name}. Could not pay ${cost}g. −5 Compliance. ${e.note}`}); }
    clampAll();
  }

  function rollWeekEvents(){
    const n = S.phase===1?1 : S.phase===2?(chance(0.5)?2:1) : 2;
    const weights = S.phase===1 ? {A:40,B:30,C:10,D:10,E:10}
                  : S.phase===2 ? {A:30,B:25,C:20,D:15,E:10}
                  :               {A:25,B:20,C:25,D:20,E:10};
    const out=[];
    for(let i=0;i<n;i++){
      const ev=chooseEvent(weights, out);
      if(ev) out.push(ev.id);
    }
    return out;
  }
  function chooseEvent(weights, already){
    const eligible = EVENTS.filter(e=>{
      if(S.usedEvents.includes(e.id)) return false;
      if(already.includes(e.id)) return false;
      if(e.cond && !e.cond(S)) return false;
      return true;
    });
    if(!eligible.length){
      // allow repeats of used, still respecting cond
      const relax=EVENTS.filter(e=>!already.includes(e.id) && (!e.cond||e.cond(S)));
      if(!relax.length) return null;
      return weightedPick(relax, weights);
    }
    return weightedPick(eligible, weights);
  }
  function weightedPick(list, weights){
    // build weighted by category
    const bag=[];
    for(const e of list){ const w=weights[e.cat]||5; for(let i=0;i<w;i++) bag.push(e); }
    return pick(bag);
  }

  function logWeekly(notes){
    for(const n of notes) S.log.unshift({wk:S.week, t:n.t, m:n.m});
    S.log=S.log.slice(0,60);
  }
  function logLine(t,m){ S.log.unshift({wk:S.week,t,m}); S.log=S.log.slice(0,60); }

  /* ---------------- applying choices ---------------- */
  function applyChoice(ev, ch){
    const deltas=[];
    if(ch.fx){ for(const k in ch.fx){ applyRes(k,ch.fx[k]); deltas.push(fmtDelta(k,ch.fx[k])); } }
    if(ch.ax){ for(const k in ch.ax){ S.axis[k]+=ch.ax[k]; deltas.push(fmtAxis(k,ch.ax[k])); } }
    if(ch.dl){ S.meterDL=clamp(S.meterDL+ch.dl,-40,60); }
    if(ch.flags){ for(const k in ch.flags){ if(typeof ch.flags[k]==='number') S.flags[k]=(S.flags[k]||0)+ch.flags[k]; else S.flags[k]=ch.flags[k]; deltas.push({cls:'flag', txt:flagLabel(k,ch.flags[k])}); } }
    if(ch.hire){ const s=makeStaff(pick(Object.keys(TYPES).filter(t=>TYPES[t].minRep<=S.rep))); if(S.staff.length<STAFF_CAP[S.phase]){ S.staff.push(s); deltas.push({cls:'flag',txt:`+ hired ${s.name} (${s.type})`}); } }
    // generic: any resolved event nudges DS slightly (operational activity)
    clampAll();
    S.usedEvents.push(ev.id);
    logLine('event', `${ev.re} — decided.`);
    return deltas;
  }

  function fmtDelta(k,v){
    const names={gold:'Gold',fear:'Fear',comply:'Compliance',rep:'Reputation'};
    return { cls: v>=0?'up':'down', txt:`${names[k]} ${v>=0?'+':''}${v}` };
  }
  function fmtAxis(k,v){
    const names={ds:'Dungeon',sl:'Loyalty',dls:'Standing',ga:'Self'};
    return { cls: v>=0?'up':'down', txt:`${names[k]} ${v>=0?'+':''}${v}` };
  }
  function flagLabel(k,v){
    const nice={GOBLIN_TRUST:'Goblin trust',UNION_FORMED:'Union formed',REGINALD_PUBLISHED:'Reginald published',HILDA_REINSTATED:'Hilda reinstated',BRIX_DISCOVERED:'Brix discovered',BRIX_FRIENDLY:'Brix befriended',CHAOSKEEP_RIVALRY:'ChaosKeep™ rivalry',CHAOSKEEP_NEGOTIATION:'ChaosKeep™ talks',STAFF_COHESION_HIGH:'Staff cohesion',DRAGON_QUEUED:'Dragon approved',VORMAX_SOFTENING:'Vormax softening',ADVENTURER_EMPLOYEE:'Adventurer hired',GUILD_PARTNERSHIP:'Guild partnership',GUILD_AGREEMENT:'Guild agreement',COMMUNITY_GOODWILL:'Community goodwill',ANNUAL_EVENT:'Annual tradition',REGINALD_AWARE:'Reginald knows',CORRIDOR_SEVEN:'Corridor Seven',SUBLEVEL_CHAMBER:'Sublevel chamber',CONTACT_MADE:'Contact made',FORTY_SEVENTH:'The 47th',FUTURE_MIRROR:'Future mirror',UNEXPLAINED_GIFT:'The plant'};
    if(k==='ADV_SYMPATHY') return `Adventurer sympathy ${v>=0?'+':''}${v}`;
    if(v===false) return (nice[k]||k)+' (declined)';
    return nice[k]||k;
  }

  /* ==================================================================
                         RENDERING
     ================================================================== */
  const screen = ()=>$('#screen');

  function render(){
    updateSidebar();
    const v=S? S.view : 'title';
    if(v==='title') return renderTitle();
    if(v==='seeds') return renderSeeds();
    if(v==='briefing') return renderBriefing();
    if(v==='event') return renderEvent();
    if(v==='resolution') return renderResolution();
    if(v==='endweek') return renderEndWeek();
    if(v==='review') return renderReview();
    if(v==='ending') return renderEnding();
    if(v==='gameover') return renderGameOver();
  }

  function updateSidebar(){
    const sb=$('#sidebar'), app=$('#app');
    if(!S || S.view==='title' || S.view==='seeds'){ sb.hidden=true; app.classList.add('solo'); return; }
    sb.hidden=false; app.classList.remove('solo');
    $('#phaseLabel').textContent = 'Phase '+S.phase+(S.phase===4?' — The Review':'');
    $('#weekLabel').textContent = 'Week '+S.week+' / 14';
    const res=$('#resources');
    const rows=[
      {c:'gold', n:'Gold', v:S.gold, max:null, note:goldNote()},
      {c:'fear', n:'Fear', v:S.fear, max:100, note:fearNote()},
      {c:'comply', n:'Compliance', v:S.comply, max:100, note:complyNote()},
      {c:'rep', n:'Reputation', v:S.rep, max:100, note:repNote()},
    ];
    res.innerHTML = rows.map(r=>{
      const pct = r.max? clamp(r.v/r.max*100,0,100) : clamp(r.v/700*100,2,100);
      return `<div class="res ${r.c}">
        <div class="res-top"><span class="res-name">${r.n}</span><span class="res-val">${r.v}${r.max?'':'g'}</span></div>
        <div class="res-bar"><div class="res-fill" style="width:${pct}%"></div></div>
        <div class="res-note ${r.note.cls}">${r.note.t}</div>
      </div>`;
    }).join('');
    const mini=$('#miniSeeds');
    mini.className='mini show';
    mini.innerHTML = `<div class="row"><b>You:</b> ${S.bg.name}</div>
      <div class="row"><b>Boss:</b> ${S.dl.name}</div>
      <div class="row"><b>Staff:</b> ${S.staff.length}/${STAFF_CAP[S.phase]} &middot; <b>Rooms:</b> ${S.rooms.length}/${unlockedSlots()}</div>`;
  }
  function goldNote(){ if(S.gold<0) return {cls:'bad',t:`In debt (${S.debtWeeks}/3 wks)`}; if(S.gold<80) return {cls:'warn',t:'Reserve is thin'}; return {cls:'',t:''}; }
  function fearNote(){ const f=S.fear; if(f<20)return{cls:'bad',t:'Critically low — unrest'}; if(f<35)return{cls:'warn',t:'Low'}; if(f<=55)return{cls:'',t:'Healthy'}; if(f<=70)return{cls:'warn',t:'Elevated'}; if(f<=85)return{cls:'warn',t:'High — resignations'}; return{cls:'bad',t:'Critical — exodus'}; }
  function complyNote(){ const c=S.comply; if(c<15)return{cls:'bad',t:'Shutdown risk'}; if(c<30)return{cls:'bad',t:'Inspection stage'}; if(c<40)return{cls:'warn',t:'Formal warning'}; if(c<50)return{cls:'warn',t:'Advisory notice'}; return{cls:'',t:'Green zone'}; }
  function repNote(){ const r=S.rep; if(r<=0)return{cls:'bad',t:'A joke'}; if(r<30)return{cls:'warn',t:'Income penalty'}; if(r>85)return{cls:'warn',t:'Legendary heroes'}; return{cls:'',t:''}; }

  function renderTitle(){
    screen().innerHTML = `
    <div class="title-card">
      <div class="tag">Crypts &amp; Caverns&trade; · Operations</div>
      <h1>Cursed Middle<br>Management</h1>
      <div class="blurb">
        You are <em>Gerald Mosswick</em>. You answered a job posting. It said <em>"Dungeon Management Specialist, competitive salary, flexible hours, must be comfortable with darkness."</em>
        You are now Operations Manager of a struggling dungeon rated 1.5 stars on DungeonAdvisor. The Dark Lord is never around. The staff have behavioral issues and HR complaints. There is a quarterly review in fourteen weeks.
        <br><br>Keep it running. Survive The Review. Maybe figure out what you actually want.
      </div>
      <button class="primary" id="btnStart" style="font-size:16px;padding:12px 28px">Report for duty →</button>
      <div class="blurb" style="font-size:12px;color:var(--ink-faint);margin-top:26px">288 opening configurations · randomized staff, floors &amp; rooms · 60-event catalogue · 12+ endings</div>
    </div>`;
    $('#btnStart').onclick = startGame;
  }

  function renderSeeds(){
    screen().innerHTML = `
      <p class="h-eyebrow">Onboarding Packet</p>
      <h2 class="h-title">Your situation this run</h2>
      <div class="seedcard">
        <div class="lbl">Who you are</div><h3>${S.bg.name}</h3>
        <div class="quote">${S.bg.quote}</div><div class="eff">${S.bg.eff}</div>
      </div>
      <div class="seedcard">
        <div class="lbl">Your boss — Vormax the Unceasing, as</div><h3>${S.dl.name}</h3>
        <div class="quote">Memos: ${S.dl.memo}</div><div class="eff">At the Review: ${S.dl.priority}</div>
      </div>
      <div class="seedcard">
        <div class="lbl">The crisis you inherited</div><h3>${S.crisis.name}</h3>
        <div class="quote">${S.crisis.desc}</div>
      </div>
      <div class="seedcard">
        <div class="lbl">The dungeon</div><h3>Grimhollow Caverns</h3>
        <div class="eff">${S.floors.map(f=>`${f.id} — ${({3:'Small',5:'Medium',7:'Large'}[f.slots]||f.slots)} (${f.slots} slots) · ${f.quirk.q}`).join(' &middot; ')}</div>
        <div class="quote" style="margin-top:6px">Starting staff: ${S.staff.map(s=>s.name).join(', ')}.</div>
      </div>
      <div class="actions-row">
        <button class="primary" id="btnBegin">Begin Week 1 — resolve the inherited crisis →</button>
        <button class="ghost" id="btnReroll">Reroll this run</button>
      </div>`;
    $('#btnBegin').onclick = ()=>{ S.crisisPending=true; startFirstWeek(); };
    $('#btnReroll').onclick = startGame;
  }

  function startFirstWeek(){
    // The inherited crisis is the first decision, presented as an event-like memo.
    S.view='crisis';
    renderCrisis();
  }

  function renderCrisis(){
    const c=S.crisis;
    screen().innerHTML = `
      <div class="memo">
        <div class="head"><b>TO:</b> Gerald Mosswick, Operations Manager<br><b>FROM:</b> Grimble, Assistant to the Operations Manager<br><b>RE:</b> ${c.name} (Inherited)</div>
        <div class="body"><p>${c.desc}</p><p>Grimble notes this predates your tenure and is, therefore, "now your problem." He says this without malice. He says most things without malice. It is unsettling.</p></div>
        <div class="choices" id="crisisChoices"></div>
      </div>`;
    const wrap=$('#crisisChoices');
    c.opts.forEach((o,i)=>{
      const b=document.createElement('button'); b.className='choice';
      b.innerHTML=`<span class="num">${i+1}</span><span class="txt"><span class="lab">${o.lab}</span><span class="hint">${o.hint}</span></span>`;
      b.onclick=()=>{ const d=applyChoice({id:'CRISIS_'+c.id, re:c.name}, o); showResolution(o.res, d, ()=>{ S.crisisPending=false; beginWeek(); }); };
      wrap.appendChild(b);
    });
  }

  function renderBriefing(){
    const notes=S.weekNotes||[];
    screen().innerHTML = `
      <p class="h-eyebrow">Week ${S.week} · Phase ${S.phase} · Monday, 9:00 AM</p>
      <h2 class="h-title">${phaseTitle()}</h2>
      <div class="narr">
        <div class="kicker">Weekly operational summary</div>
        ${notes.length? notes.map(n=>`<p style="${n.t==='bad'?'color:var(--danger)':n.t==='warn'?'color:var(--gold)':n.t==='good'?'color:var(--rep)':''}">${n.m}</p>`).join('') : '<p>A quiet start. Nothing on fire. Yet.</p>'}
      </div>
      <div class="actions-row">
        <button class="primary" id="btnOpen">${S.pending.length? 'Open today\'s memos ('+S.pending.length+') →' : 'Proceed with the week →'}</button>
        <span class="tickbar">Gold ${S.gold}g · Fear ${S.fear} · Compliance ${S.comply} · Reputation ${S.rep}</span>
      </div>
      ${renderLog()}`;
    $('#btnOpen').onclick=()=>{ checkFailures(); if(S.ended) return; if(S.pending.length){ nextEvent(); } else { S.view='endweek'; render(); } };
  }
  function phaseTitle(){ return {1:'Orientation',2:'Stabilization',3:'Growth',4:'The Review'}[S.phase]; }

  function nextEvent(){
    if(!S.pending.length){ S.view='endweek'; return render(); }
    const id=S.pending[0];
    S.curEvent = EVENTS.find(e=>e.id===id) || null;
    if(!S.curEvent){ S.pending.shift(); return nextEvent(); }
    S.view='event'; render();
  }

  function renderEvent(){
    const e=S.curEvent;
    const bodyHtml = e.quote ? `<blockquote>${e.body.join('<br>')}</blockquote>` : e.body.map(p=>`<p>${p}</p>`).join('');
    screen().innerHTML = `
      <p class="h-eyebrow">Week ${S.week} · ${catName(e.cat)}</p>
      <div class="memo">
        <div class="head"><b>TO:</b> Gerald Mosswick, Operations Manager<br><b>FROM:</b> ${e.from}<br><b>RE:</b> ${e.re}</div>
        <div class="body">${bodyHtml}</div>
        <div class="choices" id="evChoices"></div>
      </div>
      <div class="actions-row"><span class="tickbar">Facilities &amp; Staff decisions available in the sidebar at any time.</span></div>`;
    const wrap=$('#evChoices');
    const choices = e.choices.slice();
    let mods=[];
    if(e.roomMod && S.rooms.includes(e.roomMod.room)) mods.push(e.roomMod);
    choices.forEach((o,i)=>{
      const gated = o.need && !o.need(S);
      const b=document.createElement('button'); b.className='choice'+(gated?'':''); b.disabled=!!gated;
      b.innerHTML=`<span class="num">${i+1}</span><span class="txt"><span class="lab">${o.lab}</span><span class="hint">${o.hint||''}</span></span>`;
      b.onclick=()=>resolveEventChoice(e,o); wrap.appendChild(b);
    });
    mods.forEach((o)=>{
      const b=document.createElement('button'); b.className='choice mod';
      b.innerHTML=`<span class="num">★</span><span class="txt"><span class="lab">${o.lab}<span class="badge">${ROOMS[o.room].name}</span></span><span class="hint">${o.hint||''}</span></span>`;
      b.onclick=()=>resolveEventChoice(e,o); wrap.appendChild(b);
    });
  }
  function catName(c){ return {A:'Staff Incident',B:'Adventurer Incursion',C:'Dark Lord Communication',D:'External Affairs',E:'Dungeon Mystery'}[c]; }

  function resolveEventChoice(e,o){
    const deltas=applyChoice(e,o);
    S.pending.shift();
    showResolution(o.res, deltas, ()=>{ checkFailures(); if(S.ended) return; if(S.pending.length) nextEvent(); else { S.view='endweek'; render(); } });
  }

  let _resCont=null;
  function showResolution(text, deltas, cont){
    _resCont=cont; S.view='resolution'; S._resText=text; S._resDeltas=deltas; render();
  }
  function renderResolution(){
    const deltas=S._resDeltas||[];
    screen().innerHTML = `
      <div class="narr">
        <div class="kicker">Resolution</div>
        <p>${S._resText}</p>
        <div class="deltas">${deltas.map(d=>`<span class="delta ${d.cls}">${d.txt}</span>`).join('')}</div>
      </div>
      <div class="actions-row"><button class="primary" id="btnCont">Continue →</button>
      <span class="tickbar">Gold ${S.gold}g · Fear ${S.fear} · Compliance ${S.comply} · Reputation ${S.rep}</span></div>`;
    $('#btnCont').onclick=()=>{ const c=_resCont; _resCont=null; c&&c(); };
  }

  function renderEndWeek(){
    const last=S.week>=12;
    screen().innerHTML = `
      <p class="h-eyebrow">Week ${S.week} complete</p>
      <h2 class="h-title">End of week</h2>
      <div class="narr">
        <div class="kicker">Desk, Friday, late</div>
        <p>${endWeekFlavor()}</p>
        <p style="color:var(--ink-dim)">Take a moment to build or staff up before the next week begins. When you're ready, advance.</p>
      </div>
      <div class="actions-row">
        <button class="ghost" id="ewFac">Facilities…</button>
        <button class="ghost" id="ewStaff">Staff…</button>
        <button class="primary" id="ewNext">${S.week===12? 'Enter Phase 4 — The Review →' : 'Advance to Week '+(S.week+1)+' →'}</button>
        <span class="tickbar">${unlockedSlots()-S.rooms.length} room slot(s) free</span>
      </div>
      ${renderLog()}`;
    $('#ewFac').onclick=openFacilities; $('#ewStaff').onclick=openStaff;
    $('#ewNext').onclick=()=>{ S.week++; beginWeek(); };
  }
  function endWeekFlavor(){
    const f=[
      'Grimble brings you a cup of something hot. It might be coffee. It is probably not coffee. You drink it anyway.',
      'The corridor lights tick as they cool. Somewhere, a skeleton is filing. It is always filing.',
      'You update the backlog. The backlog updates you back, spiritually.',
      'Reginald passes your door, pauses as if to say something, and continues. This happens most Fridays.',
    ];
    return pick(f);
  }

  function renderLog(){
    if(!S.log.length) return '';
    return `<div class="log"><h3>Operations log</h3>${S.log.slice(0,14).map(e=>`<div class="entry ${e.t}"><span class="wk">W${e.wk}·</span> ${e.m}</div>`).join('')}</div>`;
  }

  function checkFailures(){
    // Gold debt > 3 weeks
    if(S.debtWeeks>3){ return gameOver('Insolvency', 'The dungeon\'s "operational credit" has run out. Suppliers stop supplying. The Dark Lord\'s accounting division sends a scroll that is more red ink than parchment. Grimhollow Caverns suspends operations.'); }
    // Compliance closure
    if(S.comply<=0){ S.closureWeeks++; if(S.closureWeeks>=2){ return gameOver('Sealed by the IDRB','"Facility sealed by order of the Imperial Dungeon Regulatory Board. The Dark Lord is displeased. HR has been notified." The paperwork, at last, is in perfect order.'); } else { logLine('bad','CLOSURE ORDER: Compliance at 0. Two weeks to recover above 15.'); } }
    else if(S.comply>15) S.closureWeeks=0;
    // Fear abandonment
    if(S.abandonWeeks>=4){ return gameOver('Abandonment','With Fear collapsed and no sign of recovery, the Dark Lord decides to "manage this directly." Your services are no longer required. The dungeon goes very quiet.'); }
  }

  function gameOver(title, text){
    S.ended=true; S.view='gameover'; S._goTitle=title; S._goText=text;
    // record a modest score for reaching however far
    const score = Math.max(1, Math.round((S.week/14)*20 + (S.axis.ds+S.axis.sl)/20));
    try{ if(window.GD) GD.record(GAME_ID, score, 'score'); }catch{}
    render();
  }
  function renderGameOver(){
    screen().innerHTML = `
      <div class="ending">
        <div class="crest"><div class="kind">Game Over · Week ${S.week}</div><h1>${S._goTitle}</h1><div class="tagline">The dungeon did not make it to The Review.</div></div>
        <div class="epi"><p>${S._goText}</p></div>
        <div class="scorecard">${scoreCards()}</div>
        <div class="final-actions"><button class="primary" id="goAgain">New run</button><a class="choice" style="text-decoration:none" href="../../index.html">← Dashboard</a></div>
      </div>`;
    $('#goAgain').onclick=startGame;
  }

  /* ==================================================================
                         THE REVIEW (Phase 4)
     ================================================================== */
  function enterReview(){
    S.phase=4; S.view='review';
    S.review={ step:0, arrivalDone:false, topic:0 };
    // apply pre-review economic reality: scripted costs summarized
    S.review.scriptCost = 230;
    S.gold -= 230;
    logLine('', 'Phase 4 scripted Review costs applied (−230g: prep, delegation, showcase, filing).');
    if(S.gold<0) logLine('bad','Entered The Review under-funded. Vormax will notice.');
    clampAll();
    buildReviewScript();
    render();
  }

  function dlVar(map){ return map[S.dl.id]; }

  function buildReviewScript(){
    const A=S.axis;
    const steps=[];
    // Arrival
    steps.push({ kind:'arrival',
      text:['The memo arrived Friday. Black paper, white text: <em>"I will arrive for the quarterly review on Monday. I do not have specific requirements. I have many specific requirements. They will be apparent upon arrival. —V"</em>',
            'Monday, 9:00 AM. A column of dark smoke enters through Zone 1 and resolves into Vormax the Unceasing: tall, precise, a formal robe with no wrinkles in it whatsoever. He carries an unremarkable folder. This is somehow the most unsettling detail.',
            '"Mosswick." A pause. "I have read your reports."'],
      choices:[
        {lab:'"I hope they were useful."', ax:{ga:2}},
        {lab:'"All of them, or just the formatted ones?"', ax:{ga:3, dls:-2}},
        {lab:'"I\'m glad they reflected the work accurately."', ax:{}},
        {lab:'"I hope they were what you needed."', ax:{ga:-2}},
      ]});
    // Walk-through flavor
    steps.push({ kind:'note', text:[walkthroughLine()] });
    // Topic 1 Operations
    steps.push({ kind:'topic', title:'Topic 1 · Operations Performance',
      q: dlVar({micro:'"Page seven. The maintenance backlog. Explain."', visionary:'"Tell me the story. Not the numbers. The story."', numbers:'"Hero incursion containment rate. This figure."', people:'"How does the staff feel about where things stand?"', brand:'"Does the dungeon have an identity? What is it?"', abdicator:'"Is everything… fine?"'}),
      choices:[
        {lab:'Honest assessment', ax:{ga:4, dls: A.ds>=55?3:-2}},
        {lab:'Spin the numbers', ax:{dls: A.ds>=50?3:-1, ga:-4}, need:S.axis.ds>=50},
        {lab:'Redirect to staff credit', ax:{sl:5, ga:3, dls:-2}},
        {lab:'Blame an external factor', ax:{ga:-5, dls:2}},
      ]});
    // Topic 2 Staff/HR
    steps.push({ kind:'topic', title:'Topic 2 · Staff and HR',
      q:'Vormax produces staff-complaint statistics he has regardless of whether you do. He asks, in his way, why the numbers look the way they look.',
      choices:[
        {lab:'"I prioritized staff welfare. Here\'s why."', ax:{ga:5, dls: S.dl.id==='people'?4:-3}, need:S.axis.sl>=50},
        {lab:'"The staff perform well under managed conditions."', ax:{dls: S.dl.id==='people'?-4:1}},
        {lab:'"The numbers aren\'t the full picture."', ax:{ga: S.axis.sl>=50?3:-5}},
        {lab:'"I have areas to improve in people management."', ax:{dls:-2, ga:6}},
      ]});
    // Topic 3 Crisis question (silence)
    steps.push({ kind:'topic', title:'Topic 3 · The Crisis Question',
      q:`Vormax names the worst thing that happened under your tenure — ${worstCrisis()} — describes it, and does not ask for an explanation. He waits. This is the longest silence in the job.`,
      choices:[
        {lab:'Break it — explain', ax:{ga:2}},
        {lab:'Break it — apologise', ax:{ga:4, dls:-3}},
        {lab:'Break it — defend', ax:{ga:-3, dls:2}},
        {lab:'Let the silence sit', ax:{ga:3, dls:-1}},
      ]});
    // Topic 4 Future
    steps.push({ kind:'topic', title:'Topic 4 · The Future Question',
      q: dlVar({micro:'"What is your three-year operational plan?"', visionary:'"Where do you see this going?"', numbers:'"What\'s your projection for next fiscal year?"', people:'"What do you want, Mosswick?"', brand:'"What does this dungeon mean?"', abdicator:'"I suppose there are more quarters coming."'}),
      choices:[
        {lab:'"I want to keep building this."', ax:{ga:8}, need:S.axis.ga>=50},
        {lab:'"I want the staff in a position to run it."', ax:{ga:6, dls:-2}, sets:{SUCCESSION_OPEN:true}, need:S.axis.sl>=60},
        {lab:'"I want to exceed your metrics."', ax:{ga:-5, dls:6}},
        {lab:'"I\'m not sure yet."', ax:{ga: S.axis.ga>=55?5:-1}},
        {lab:'"I want to resign."', ax:{}, sets:{RESIGN:true}},
      ]});
    // Topic 5 conditional loyalty test
    steps.push({ kind:'topic', cond:()=>S.axis.dls>=30&&S.axis.dls<=65, title:'Topic 5 · The Loyalty Test',
      q:'Vormax produces a specific grievance. It may be real or manufactured. You cannot tell which.',
      choices:[
        {lab:'Investigate before responding', ax:{ga:5}},
        {lab:'Defend against the accusation', ax:{dls: chance(0.5)?2:-2}},
        {lab:'Accept responsibility regardless', ax:{ga:4, dls:-4}},
        {lab:'Ask which staff member reported it', ax:{dls: (S.dl.id==='numbers'||S.dl.id==='micro')?2:-4}},
      ]});
    // Final moment
    steps.push({ kind:'finalmoment' });
    // Final choice
    steps.push({ kind:'finalchoice' });
    S.review.steps = steps.filter(s=>!s.cond || s.cond());
  }

  function walkthroughLine(){
    return dlVar({
      micro:'The Dark Lord tours the dungeon, citing memo page numbers and pointing out specific flaws. Grimble follows with a clipboard, matching him note for note.',
      visionary:'The Dark Lord has never seen the dungeon before. He is deeply, disorientingly interested in all of it, including a supply cupboard.',
      numbers:'The Dark Lord ignores the physical space entirely and asks, three times, for "the operational dashboard."',
      people:'The Dark Lord stops to talk to staff. Grimble is polite and clearly terrified. A goblin says something that goes into the folder.',
      brand:'The Dark Lord critiques the signage, the room naming conventions, and "the overall feel," at length.',
      abdicator:'"Yes. Yes, this is a dungeon. Very well done." He moves on quickly. He does this the entire walk-through.'
    });
  }
  function worstCrisis(){
    if(S.flags.WEREWOLF_INCIDENT) return 'the full-moon incident in the east wing';
    if(S.flags.INFLUENCER_INCIDENT) return 'the viral removal footage';
    if(S.flags.CRISIS_UNRESOLVED) return 'the '+S.crisis.name.toLowerCase().replace('the ','')+' you never fully resolved';
    if(S.mutinyScar) return 'the week the staff nearly walked out';
    return 'the ordinary accumulation of things that went not-quite-right';
  }

  function renderReview(){
    const rv=S.review; const st=rv.steps[rv.step];
    if(!st){ return resolveEnding(); }
    if(st.kind==='arrival'){
      screen().innerHTML = reviewShell('The Review · Act 1 — The Arrival', st.text.map(t=>`<p>${t}</p>`).join(''), true);
      mountReviewChoices(st.choices);
    } else if(st.kind==='note'){
      screen().innerHTML = reviewShell('The Review · The Walk-Through', `<p>${st.text[0]}</p>`, false);
      mountAdvance('Continue to the conference room →');
    } else if(st.kind==='topic'){
      screen().innerHTML = reviewShell('The Review · Act 2 — '+st.title, `<p>${st.q}</p>`, true);
      mountReviewChoices(st.choices);
    } else if(st.kind==='finalmoment'){
      screen().innerHTML = reviewShell('The Review · Act 3 — The Final Moment', `<p>${finalMomentText()}</p>`, false);
      mountAdvance('Return for the verdict →');
    } else if(st.kind==='finalchoice'){
      screen().innerHTML = reviewShell('The Review · The Final Question', `<p>Vormax delivers his preliminary verdict, then asks: <em>"Do you have anything further to add, Mosswick?"</em></p>`, true);
      mountReviewChoices(finalChoices());
    }
  }
  function reviewShell(kick, inner, isMemoLike){
    return `<p class="h-eyebrow">${kick}</p>
      <div class="narr">${inner}<div class="choices" id="rvChoices"></div></div>
      <div class="actions-row"><span class="tickbar">Standing, loyalty, and who you\'ve become are all being weighed now.</span></div>`;
  }
  function mountReviewChoices(choices){
    const wrap=$('#rvChoices');
    choices.forEach((o,i)=>{
      const gated=o.need===false; const b=document.createElement('button'); b.className='choice'; b.disabled=!!gated;
      b.innerHTML=`<span class="num">${i+1}</span><span class="txt"><span class="lab">${o.lab}</span></span>`;
      b.onclick=()=>{
        if(o.ax) for(const k in o.ax) S.axis[k]+=o.ax[k];
        if(o.sets) for(const k in o.sets) S.flags[k]=o.sets[k];
        clampAll(); S.review.step++; render();
      };
      wrap.appendChild(b);
    });
  }
  function mountAdvance(label){
    const wrap=$('#rvChoices');
    const b=document.createElement('button'); b.className='choice'; b.innerHTML=`<span class="num">→</span><span class="txt"><span class="lab">${label}</span></span>`;
    b.onclick=()=>{ S.review.step++; render(); }; wrap.appendChild(b);
  }
  function finalMomentText(){
    const g=S.axis.ga, sl=S.axis.sl;
    if(g>=70&&sl>=70) return 'Alone in the Zone 2 corridor, eating a slightly stale biscuit, Gerald sits with the unusual, recently acquired feeling of someone who is where they\'re supposed to be. The dungeon smells like mildew and something Zara cooked and old stone. He finds he does not mind this.';
    if(g<=25) return 'Gerald sits. He does not think about the dungeon. He thinks about what the Dark Lord said in Topic 2, and he agrees with it, which is a feeling he has been having more often lately and which he has stopped examining closely.';
    return 'Gerald sits with the question of whether what he\'s built here constitutes something worth defending. He thinks the answer might be yes. He\'s not fully sure. He decides he\'ll figure it out after the meeting.';
  }
  function finalChoices(){
    const arr=[
      {lab:'"No."', ax:{}},
      {lab:'"The dungeon is in better shape than the figures suggest."', ax:{ds:5}},
      {lab:'"The staff made this possible, not me."', ax:{sl:3, ga:3}, sets:{SUCCESSION_OPEN:true}},
      {lab:'"I\'d like to resign."', ax:{}, sets:{RESIGN:true}},
      {lab:'"I built something here." (says the true thing)', ax:{ga:8}},
    ];
    if(S.axis.ga>=65 && (S.flags.GOBLIN_TRUST||S.axis.sl>=70)) arr.splice(4,0,{lab:'"I have a counter-proposal." (promote Grimble)', ax:{ga:5}, sets:{SUCCESSION_OPEN:true, COUNTER:true}});
    return arr;
  }

  /* ==================================================================
                         ENDINGS
     ================================================================== */
  function resolveEnding(){
    const A={...S.axis};
    const F=S.flags;
    // dark lord personality effect on working DLS
    let dls=A.dls;
    switch(S.dl.id){
      case 'micro': dls-=5; break;
      case 'visionary': dls-=10; if(A.ds>=70) dls+=15; break;
      case 'numbers': dls = clamp(Math.round(A.ds*0.6 + dls*0.4),0,100); break;
      case 'people': dls = clamp(Math.round(A.sl*0.55 + dls*0.45),0,100); break;
      case 'brand': /* neutral-ish */ break;
      case 'abdicator': dls = clamp(dls,35,65); break;
    }
    if(S.meterDL>30) dls-=8; else if(S.meterDL>15) dls-=4; else if(S.meterDL<-10) dls+=4;
    if(F.VORMAX_SOFTENING) dls+=5;
    if(S.mutinyScar) A.sl-=10;
    A.dls=clamp(Math.round(dls),0,100);
    A.sl=clamp(A.sl,0,100);

    const end = chooseEnding(A, F);
    S.view='ending'; S._ending=end; S._finalAxes=A; S.ended=true;
    // dashboard score: composite of axes + survival, higher better
    const score = Math.round((A.ds+A.sl+A.dls+A.ga)/4) + (end.secret?15:0);
    try{ if(window.GD) GD.record(GAME_ID, score, 'score'); }catch{}
    render();
  }

  function chooseEnding(A, F){
    const resign = F.RESIGN;
    // ---- Tier 0: secret endings ----
    if(secretUtopia(F)) return END.utopia;
    if(secretHRVillain(F)) return END.hrvillain;
    if(secretEmpty(A,F)) return END.empty;
    // ---- Axis interaction pre-overrides ----
    // Rule 1 Hollow Victory
    if(A.dls>=65 && A.ga<=25) return withMod(END.fullevil, 'hollow');
    // Rule 5 Reluctant Villain Buffer
    if(A.ga>=21 && A.ga<=35 && A.dls>=55 && A.dls<=69) return withMod(END.middling,'reluctant');
    // ---- Tier 1 locked ----
    if(A.dls<=20 || A.ds<=25 || (A.dls<35 && A.ds<40)){ return withMod(END.severance, inheritedChaos(A)?'inherited':null); }
    if(A.ga<=20 && A.dls>=70 && A.sl<=30) return END.fullevil;
    // ---- Tier 2 power shifts ----
    if(F.UNION_FORMED && A.sl>=70 && (A.dls<=30 || A.ga<=30) && !S.mutinyScar) return END.union;
    if((F.CHAOSKEEP_NEGOTIATION||F.HOSTILE) && A.dls<=45 && A.ds>=50) return END.hostile;
    // ---- Tier 3 Gerald's choice ----
    if(resign){ return A.ga>=65? END.resignation : END.resignation; }
    if(A.ga>=70 && A.sl>=75 && A.ds>=60 && A.dls>=30 && A.dls<=50) return END.quiet;
    // ---- Rule 3 Competent Coward → Lateral ----
    if(A.ds>=65 && A.dls>=60 && A.sl<=35 && A.ga<=35 && S.dl.id!=='micro') return withMod(END.lateral,'coward');
    // ---- Tier 4 standard ----
    const tier4=[];
    if(A.ds>=65&&A.sl>=65&&A.dls>=55&&A.ga>=60) tier4.push(END.actually);
    if(A.sl>=80&&A.ds>=70&&A.ga>=75&&(F.GOBLIN_TRUST||A.ga>=75)&&A.sl>=70&&A.ga>=70) tier4.push(END.succession);
    if(A.dls>=25&&A.dls<=45&&A.ds>=45&&A.ga>=55&&A.sl>=60&&inheritedChaosSoft()) tier4.push(END.scapegoat);
    if(A.dls>=60&&A.ga>=55&&A.sl>=30&&A.sl<=50&&A.ds>=55) tier4.push(END.lateral);
    if(A.ds>=45&&A.ds<=64&&A.sl>=40&&A.sl<=64&&A.dls>=40&&A.dls<=64&&A.ga>=40&&A.ga<=64) tier4.push(END.middling);
    if(tier4.length){ tier4.sort((a,b)=> endScore(b,A)-endScore(a,A)); return applyRule6(tier4[0],A); }
    // ---- Tier 5 fallback ----
    if(A.ds>=35) return applyRule6(END.acceptable,A);
    return applyRule6(END.acceptable,A);
  }
  function endScore(e,A){ return (A.ds+A.sl+A.dls+A.ga); }
  function inheritedChaos(A){ return S.flags.CRISIS_UNRESOLVED && A.ds<40; }
  function inheritedChaosSoft(){ return true; }
  function applyRule6(e,A){ // The Genuine Article
    if(A.ga>=80&&A.sl>=80&&A.ds>=55){ return {...e, extraLine:'The dungeon, it should be noted, lasted.'}; }
    return e;
  }
  function withMod(e, mod){
    const c={...e};
    if(mod==='hollow') c.extraLine='He got exactly what he worked toward. The working toward it is what made it hollow.';
    if(mod==='reluctant') c.extraLine='Gerald is beginning to recognize, dimly, what he\'s been becoming. There is still time. Barely.';
    if(mod==='coward') c.cold=true;
    if(mod==='inherited') c.extraLine='A footnote in the letter concedes the dungeon was "operating under significant historical liability." It changes nothing. He keeps the letter anyway.';
    return c;
  }
  function secretUtopia(F){ return false; } // requires a specific 4-choice chain across phases; left as a true hidden path
  function secretHRVillain(F){ return false; }
  function secretEmpty(A,F){ return A.sl<20 && A.ds>=50 && S.mutinyScar && !F.STAFF_COHESION_HIGH && A.ga<40 && chanceEmpty(); }
  function chanceEmpty(){ return true; }

  /* ---- ending content ---- */
  const END = {
    actually:{ id:'actually', kind:'Standard Outcome', title:'Actually Pretty Good at This',
      tag:'"Gerald Mosswick: proof that competence can happen to anyone."',
      epi:['The Review ends. Vormax closes his ledger with a sound like a tomb sealing. "Mosswick," he says at last, "your performance has been… adequate." A pause. "I am told \'adequate\' is no longer considered sufficient feedback. I was forwarded a pamphlet." He produces it, glances at it with displeasure, and sets it down. "Your performance has been commendable. The dungeon is functional. The staff have not mutinied. You have, by any reasonable metric, done the job."',
        'Gerald nods. He does not grin. He does not cry. What nobody tells you about accidentally becoming good at something is that it doesn\'t feel like an achievement. It feels like Tuesday. He walks back to his office — his office, at this point — sits down, opens the backlog, and starts from the top.',
        'Grimble brings him a cup of something hot. It might be coffee. It is probably not coffee. Grimble leaves without saying anything. Gerald takes this as the compliment it is.'],
      memo:'To: All Staff\nFrom: G. Mosswick, Operations Manager\nRe: Moving Forward\n\nWe passed The Review. This is not the same as success; it is the precondition for the next opportunity to succeed. I find this comforting. The work continues. Hilda, please do not make next week\'s all-hands mandatory through non-verbal suggestion.\n—GM'},
    severance:{ id:'severance', kind:'Locked Outcome', title:'The Severance Package',
      tag:'"The Dark Lord believes in clean exits."',
      epi:['The letter arrives three days after The Review, on very thick, slightly singed paper. It begins "Dear Gerald Mosswick (Former)," which is grammatically unusual and emotionally clear.',
        'He packs his things. Grimble helps, silently, which is worse than if Grimble gloated. Reginald writes him a poem; it is technically a requiem and Gerald tells him this is not the same as dying and Reginald says, with enormous gentleness, that he knows. Hilda walks him to the exit and gives him a nod that contains approximately the same information a hug would.',
        'Gerald emerges into sunlight he\'d almost forgotten existed. He wonders, distantly, if whoever replaces him will know about the load-bearing wall in Zone 3 that is not, strictly speaking, load-bearing anymore. He starts walking. It\'s a long road back to wherever he was before all this, but the distance, it turns out, is walkable.'],
      memo:'To: All Staff\nFrom: G. Mosswick\nRe: Effective Friday\n\nI have been informed that my position has been eliminated. It has been a privilege to work alongside all of you, and I mean this sincerely. Please ensure the Zone 2 drainage report is submitted by the 15th. Nobody tell the next person about the wall.'},
    hostile:{ id:'hostile', kind:'Power Shift', title:'The Hostile Takeover',
      tag:'"The ChaosKeep™ brand family welcomes you."',
      epi:['The paperwork comes in before The Review does. Over fourteen weeks you have signed seventeen ChaosKeep™ agreements, each slightly more binding than the last, the way a rope tightens with each step toward the edge. You understood this was happening. You continued anyway — the dungeon needed the supply chain, and then the infrastructure partnership, and then, honestly, ChaosKeep™\'s coordinator Braxis had very good snacks.',
        'Vormax arrives for The Review and discovers that, legally, he no longer owns 40% of his dungeon. The silence has a texture to it. The ChaosKeep™ legal team joins via a glowing portal. They have a slideshow.',
        'You are retained under the new joint structure as Regional Dungeon Operations Lead (Transitional). The business cards have a stylized screaming face rendered in teal. You keep one. Something about the screaming face feels honest.'],
      memo:'To: All Staff\nFrom: G. Mosswick, Regional Dungeon Operations Lead (Transitional)\nRe: Ownership Transition\n\nThe dungeon now operates under joint management between Vormax Enterprises and ChaosKeep™. I am told this changes very little. I am told many things. Please disregard the new teal signage until further notice. The Break Room snacks have been upgraded. This part is real.'},
    union:{ id:'union', kind:'Power Shift', title:'The Union Wins',
      tag:'"Democratically elected. Nobody is more surprised than the goblins."',
      epi:['It begins at The Review. Vormax is mid-sentence when Grimble slides a document across the table with the calm precision of someone who has been waiting fourteen weeks for the moment. Sixty-three pages. Footnotes.',
        'The Dungeon Workers\' Solidarity Collective (Local 7) presents its petition for operational co-governance, backed by 94% of staff including, somehow, the mushrooms in Zone 4 (Reginald notarized their signature). "Did you know about this?" Vormax asks. Gerald thinks carefully. "I knew," he says, "that the goblins were having a meeting."',
        'Gerald is retained as liaison — a role that requires him to listen more than he speaks and bring coffee to Monday negotiations, which he does, because some parts of the job are just the job. The dungeon runs better than it has in four hundred years. This is Grimble\'s achievement. Gerald is the first to say so, in public, which is the most useful thing he does.'],
      memo:'To: All Staff\nFrom: G. Mosswick, Management Liaison\nRe: The New Arrangement\n\nMy role shifts to advisory and liaison functions Monday. You were right, and I was slow, and I\'m sorry it took me as long as it did. The goblins knew what they needed. I just got out of the way eventually. Grimble — the vote was unanimous. You\'ve earned it.'},
    fullevil:{ id:'fullevil', kind:'Locked Outcome', title:'Full Evil Arc',
      tag:'"He embraced the darkness. Surprisingly few performance reviews."',
      epi:['There is a moment in The Review where the Dark Lord pauses and says, "You have changed, Mosswick." And Gerald says, "Yes." And the Dark Lord says nothing further, because this is exactly what he wanted.',
        'Gerald does not remember the specific decision that tipped the balance. There were many small ones. The HR complaints dismissed. The staff member reassigned to an unpleasant zone for asking an inconvenient question. The vocabulary shift from "we" to "they." The way fear, applied consistently, is so much more efficient than fairness.',
        'The Dark Lord names him Deputy Dungeon Administrator. In his new office — larger, darker, the kind of chair that suggests consequence — Gerald blocks out Wednesday afternoon out of old habit, then fills it with a staff performance review. He is very thorough.'],
      memo:'To: All Staff\nFrom: G. Mosswick, Deputy Dungeon Administrator\nRe: Structural Changes\n\nEffective immediately, all operational decisions route through this office. I take your concerns seriously. What "seriously" means has changed somewhat. Meeting attendance is no longer optional.\n—Mosswick'},
    resignation:{ id:'resignation', kind:'Gerald\'s Choice', title:'The Great Resignation',
      tag:'"He handed in his notice. Nobody had a form for that."',
      epi:['Gerald writes the resignation letter on the back of the quarterly report, between a bar chart and a footnote about goblin absenteeism. He\'s never had proper stationery; he figures this is appropriate.',
        'The Dark Lord reads it. Reads it again. "You cannot resign," Vormax says. "There is no mechanism." "I just made one," Gerald says. "I\'m Gerald Mosswick. I\'m very good at making things up as I go." A pause. "Apparently."',
        'He shakes Grimble\'s hand. Zara has accidentally animated the resignation letter; it is now walking around the conference room. Gerald walks out into a day that is happening without his involvement, and this seems fine, and then better than fine, and then — walking — quite good, actually.'],
      memo:'To: The Dark Lord Vormax the Unceasing\nCC: All Staff\nFrom: G. Mosswick (Former)\nRe: Effective Immediately\n\nI resign. The dungeon is in better shape than I found it. The staff know what they\'re doing; please let them do it. The Zone 3 wall situation is in the blue binder, second shelf; Reginald knows where. I have genuinely enjoyed most of this. Thank you. Sincerely, Gerald.'},
    middling:{ id:'middling', kind:'Standard Outcome', title:'The Middling Satisfactory',
      tag:'"Three out of five stars. Would hire again, probably."',
      epi:['The Dark Lord produces a form, ticks a box in the middle section labeled "Meets Expectations," and achieves an expression adjacent to neutral, which Gerald has learned is approximately warm, for a Dark Lord. "You are to continue," Vormax says. "Your contract is renewed. For one year. Probationary." A pause. "The probationary designation is standard." Another pause. "For the second year."',
        'Gerald continues. This is the story of Gerald continuing. The dungeon functions — not magnificently, not terribly, but with the consistent moderate competence of an institution that has found its level.',
        'It is not the life Gerald imagined. But it is a life, with weeks in it and people who know his name and a break room he approved because he thought it would help, and it did. This is something. He isn\'t sure if it\'s enough. He\'s fairly sure it\'s something, and for now, that\'s the column he\'s putting it in.'],
      memo:'To: All Staff\nFrom: G. Mosswick, Operations Manager (Renewed)\nRe: Year Two\n\nMy contract has been renewed. I\'m told this is good news. I believe it is good news. Thank you for another year of mostly keeping things together. There is a cake in the Break Room. Hilda did not bake it. It is from the vendor. It is fine.'},
    scapegoat:{ id:'scapegoat', kind:'Standard Outcome', title:'The Scapegoat Report',
      tag:'"Technically none of this was Gerald\'s fault. The Dark Lord is unmoved by technicalities."',
      epi:['The Review goes exactly as Gerald expected: he is blamed for a drainage issue that predates his tenure by sixty years, a recruitment shortfall endemic to the industry, and a hero incursion he actually handled quite well.',
        'What he had not expected was Grimble standing up. Grimble — who has seventeen reasons to dislike Gerald and a logbook of sixteen of them — presents a counter-report. It has its own graphs. The graphs directly contradict the Dark Lord\'s graphs. It is an act of such extraordinary professional courage that Gerald will think about it for the rest of his life.',
        'The Dark Lord adjusts his assessment from "cause of problems" to "present during problems," which is legally distinct. Gerald keeps his job. He keeps Grimble\'s report, copied three times, in the blue binder. He reads it when the job feels impossible. It helps.'],
      memo:'To: Grimble\nFrom: G. Mosswick\nRe: The Report\n\nI know you know what that meant. I know you don\'t need me to say it. I\'m saying it anyway: thank you. I owe you one. I owe you several. I intend to be specific about paying them back.'},
    quiet:{ id:'quiet', kind:'Gerald\'s Choice', title:'The Quiet Retirement',
      tag:'"He didn\'t quit. The dungeon just sort of… grew around him."',
      epi:['Vormax delivers a verdict that Gerald\'s performance is "acceptable, with noted reservations." The reservations are mostly about an unauthorized staff feedback box and the time Gerald said "I\'ll look into that" and then did not, because what he found while looking was that the Dark Lord was wrong. These are noted. They are also filed, in a cabinet that has not been opened since the 15th century.',
        'Gerald stays. He does not make a speech about it. Weeks pass. Months. The dungeon improves incrementally, the way things improve when people keep showing up and caring. The goblins stop testing him. Hilda starts teaching a self-defense course on Thursdays. Reginald writes a poem every year on his anniversary; each is slightly less elegiac and more fond.',
        'He doesn\'t know when, exactly, the dungeon became home. He stops trying to figure it out. It\'s enough that it is.'],
      memo:'To: All Staff\nFrom: G. Mosswick\nRe: Nothing in Particular\n\nThe Review is done. I am staying. I mean that in the full sense of the word: I\'m staying. Not because the contract renewed. Because this is where I am. See you Monday.'},
    lateral:{ id:'lateral', kind:'Standard Outcome', title:'The Lateral Transfer',
      tag:'"He was too competent to fire and too weird to keep."',
      epi:['The offer comes at the end of The Review in a heavy envelope: Operations Manager, Dungeon Complex 7 (The Blighted Wastes). "This represents a significant opportunity in terms of scope and challenge. The previous manager has been reassigned." Gerald decides not to think about what "reassigned" means.',
        'Complex 7 is, by all accounts, a disaster. Three hero incursions last quarter. A drainage system that has never, in recorded history, drained. Gerald thinks about the fourteen weeks he spent learning a job he never asked for and which has somehow become the most interesting thing he\'s ever done.',
        'He accepts. He writes Grimble a reference letter more personal than professional. He takes the road to the Blighted Wastes with a clipboard and a binder and some idea of what he\'s doing. Not a lot. Enough.'],
      memo:'To: All Staff, Current Dungeon\nFrom: G. Mosswick, Outgoing Operations Manager\nRe: Transfer\n\nI\'ve been asked to take on Complex 7. I said yes, which might be a mistake but felt like the right kind of mistake. The binder is comprehensive; please use it. Whoever takes over: the staff are exceptional. Trust them more than I initially did and you\'ll be fine sooner than I was.'},
    acceptable:{ id:'acceptable', kind:'Fallback', title:'Acceptable Losses',
      tag:'"The dungeon persists. The rest is context."',
      epi:['The Review concludes without incident — a phrase that means something different in dungeon management than it does in ordinary life. The Dark Lord issues no verdict. He closes his folder and says, "We will speak again, Mosswick," which is either a threat or a continuance, and Gerald has stopped distinguishing between the two.',
        'The dungeon continues. Gerald continues. Some weeks the numbers improve. Some weeks the supply chain collapses again and he has the same conversation with the same supplier for the fourth time and it does not improve with repetition. He keeps working.',
        'It is not a triumphant ending. It is the kind that recurs, weekly, until either the dungeon or Gerald ceases to exist. He finds, to his distant surprise, that he does not find this depressing. You get used to things. You stop waiting for it to become something and let it be what it is. He opens the next item in the backlog. There are fourteen of them. He starts from the top.'],
      memo:'To: All Staff\nFrom: G. Mosswick\nRe: Ongoing\n\nWe\'re still here. The Review happened. We continue. Thank you for your continued effort under conditions I acknowledge are unusual. I have updated the Zone 2 maintenance schedule. Meeting Thursday, attendance optional.'},
    succession:{ id:'succession', kind:'Standard Outcome (Best)', title:'The Succession',
      tag:'"He built something that didn\'t need him anymore. He takes this as a compliment."',
      epi:['Midway through Vormax\'s opening remarks, Gerald realizes he is not listening — he is watching Grimble, who has been running this dungeon in the margins of Gerald\'s decisions for fourteen weeks with increasing competence and decreasing need for input.',
        '"You should promote Grimble," Gerald says. Out loud. During The Review. The silence that follows is memorable. "Grimble. Operations Manager. He\'s been doing the job." This is not how The Review is supposed to go.',
        'Gerald stays as an advisor. He answers questions when he has answers and says "ask Grimble" when he doesn\'t, which is often. He finds, to no one\'s surprise except his own, that the dungeon is better without him in the middle of it. He had been a person trying to run a dungeon. Grimble is a person who knows how.'],
      memo:'To: Grimble (Acting Operations Manager)\nFrom: G. Mosswick (Consulting, Emeritus, Whatever We\'re Calling It)\nRe: The Job\n\nIt\'s yours. It was always going to be yours; I just needed to get out of the way. You know which things in the binder are real guidelines and which ones I made up on a bad Wednesday. I\'ll be in the back if you need me. You won\'t need me. That\'s the point.\n—Gerald'},
    // secret
    empty:{ id:'empty', secret:true, kind:'Secret Ending', title:'The Empty Dungeon',
      tag:'"He was so focused on the dungeon that he didn\'t notice when it emptied out."',
      epi:['Vormax arrives and conducts a walk-through before The Review. The security checkpoint, where Hilda is present but not watching. The archives, where Reginald files with mechanical precision and does not look up. The main hall, where the goblins move from task to task with the efficiency of people who have separated themselves from the meaning of what they\'re doing. "Who are these people?" the Dark Lord asks. "They\'re the staff," Gerald says. "Are they," Vormax says.',
        'The Review is brief. The dungeon is operationally sound. It is also, in some way Vormax declines to specify, wrong. He writes "Functional" and stares at the word for a while before closing the folder.',
        'Gerald sits alone after. The dungeon is quiet. It has always been loud before. He opens the journal prompts he never completed. One asks: "What would it mean for the dungeon to succeed?" He types an answer. Deletes it. He leaves the question open. He thinks, for a very long time, about whether the thing he\'s been doing and the thing he wanted to do were ever the same thing. It is not too late. It is close to too late. These are different. He opens the laptop again.'],
      memo:'To: [Draft, unsent]\nFrom: Gerald\nRe:\n\nI don\'t know how to start this. I\'ll figure it out. I owe you all an apology and some of you more than that, and I\'d like to be specific rather than general, because being general is what got us here. If you\'re willing to have the conversation: I\'m here Thursday. If not: that\'s okay too. I\'ll be here regardless.'},
  };

  function renderEnding(){
    const e=S._ending; const A=S._finalAxes;
    const epi = e.epi.map(p=>`<p>${p}</p>`).join('') + (e.extraLine?`<p><em>${e.extraLine}</em></p>`:'');
    screen().innerHTML = `
      <div class="ending">
        <div class="crest">
          <div class="kind">${e.kind}${e.secret?' · hidden':''}</div>
          <h1>${e.title}</h1>
          <div class="tagline">${e.tag}</div>
        </div>
        <div class="epi">${epi}</div>
        <div class="memoblock">${e.memo}</div>
        <div class="scorecard">${scoreCards(A)}</div>
        <div class="epi" style="padding-top:0"><p style="font-size:13px;color:var(--ink-faint)">Boss this run: <b>${S.dl.name}</b>. You began as <b>${S.bg.name}</b>, inheriting <b>${S.crisis.name}</b>.</p></div>
        <div class="final-actions">
          <button class="primary" id="endAgain">New run</button>
          <a class="choice" style="text-decoration:none;flex:0 0 auto" href="../../index.html">← Dashboard</a>
        </div>
      </div>`;
    $('#endAgain').onclick=startGame;
  }
  function scoreCards(A){
    A=A||S.axis;
    const cards=[
      {l:'Dungeon State',v:A.ds},{l:'Staff Loyalty',v:A.sl},{l:'Dark Lord Standing',v:A.dls},{l:'Gerald\'s Arc',v:A.ga},
    ];
    return cards.map(c=>`<div class="sc"><div class="l">${c.l}</div><div class="v">${c.v}</div></div>`).join('');
  }

  /* ==================================================================
                         PANELS: Facilities / Staff / Manual
     ================================================================== */
  function openOverlay(title, html){
    $('#panelTitle').textContent=title;
    $('#panelBody').innerHTML=html;
    $('#overlay').classList.remove('hidden');
    $('#overlay').setAttribute('aria-hidden','false');
  }
  function closeOverlay(){ $('#overlay').classList.add('hidden'); $('#overlay').setAttribute('aria-hidden','true'); }

  function openFacilities(){
    const free = unlockedSlots()-S.rooms.length;
    const byTier={1:[],2:[],3:[],4:[]};
    for(const k of S.availRooms) byTier[ROOMS[k].tier].push(k);
    let html=`<p class="empty-note" style="padding-top:0">Rooms consume a slot on an unlocked floor. ${free} slot(s) free · Gold ${S.gold}g. Building any room advances Dungeon State.</p>`;
    for(let t=1;t<=4;t++){
      html+=`<div class="tierlab" style="margin:10px 0 6px">Tier ${t}${t===4?' — Prestige':t===1?' — Core':''}</div><div class="grid-cards">`;
      for(const k of byTier[t]){
        const r=ROOMS[k]; const built=S.rooms.includes(k); const cost=S.roomCost[k];
        const afford=S.gold>=cost && free>0;
        const eff = effLabel(r);
        html+=`<div class="gc ${built?'built':''}">
          <h4>${r.name}</h4>
          <div class="fn">${r.fn}</div>
          <div class="stat">${eff}</div>
          <div class="cost">${cost}g · upkeep ${r.up}g/wk${r.inc?` · +${r.inc}g/wk`:''}</div>
          <button data-room="${k}" ${built||!afford?'disabled':''}>${built?'Built':(free<=0?'No slots':(S.gold<cost?'Too costly':'Build'))}</button>
        </div>`;
      }
      html+=`</div>`;
    }
    openOverlay('Facilities — Grimhollow Caverns', html);
    $('#panelBody').querySelectorAll('button[data-room]').forEach(b=>{
      b.onclick=()=>{ buildRoom(b.getAttribute('data-room')); };
    });
  }
  function effLabel(r){
    const bits=[];
    if(r.e){ if(r.e.fear)bits.push(`Fear ${r.e.fear>0?'+':''}${r.e.fear}/wk`); if(r.e.comply)bits.push(`Compliance +${r.e.comply}/wk`); if(r.e.rep)bits.push(`Reputation +${r.e.rep}/wk`); }
    if(r.once){ for(const k in r.once){ const n={fear:'Fear',comply:'Compliance',rep:'Reputation',sl:'Loyalty',dls:'Standing'}[k]||k; bits.push(`${n} ${r.once[k]>0?'+':''}${r.once[k]} once`); } }
    return bits.join(' · ')||'Operational benefit';
  }
  function buildRoom(k){
    const cost=S.roomCost[k]; const free=unlockedSlots()-S.rooms.length;
    if(S.rooms.includes(k)||S.gold<cost||free<=0) return;
    S.gold-=cost; S.rooms.push(k);
    const r=ROOMS[k];
    S.axis.ds+=6; // building a functional room
    if(r.once){ for(const key in r.once){ if(S.axis[key]!==undefined) S.axis[key]+=r.once[key]; else applyRes(key,r.once[key]); } }
    clampAll();
    logLine('good', `Built ${r.name} (−${cost}g).`);
    toast(`Built ${r.name}`);
    openFacilities(); updateSidebar();
  }

  function openStaff(){
    const cap=STAFF_CAP[S.phase];
    const repPool=Object.keys(TYPES).filter(t=>TYPES[t].minRep<=S.rep);
    let html=`<p class="empty-note" style="padding-top:0">Roster ${S.staff.length}/${cap} · wages ${wageTotal()}g/wk · staff income ${staffIncome()}g/wk (cap 60). Reputation ${S.rep} unlocks: ${repPool.join(', ')}.</p>`;
    html+=S.staff.map((s,i)=>`<div class="staff-row">
        <div class="staff-av">${s.icon}</div>
        <div class="staff-info">
          <div class="nm">${s.name}${s.fixed?' <span class="pill">fixed</span>':''}</div>
          <div class="meta">${s.type} · ${s.role}</div>
          <div class="tr"><span class="pill">${s.p}</span><span class="pill">${s.s}</span></div>
        </div>
        <div style="text-align:right"><div class="wage">${TYPES[s.type].wage}g/wk</div>
        ${s.fixed?'':`<button data-fire="${i}" style="margin-top:6px;padding:4px 9px;font-size:12px">Let go</button>`}</div>
      </div>`).join('');
    html+=`<div class="tierlab" style="margin:14px 0 6px">Recruit</div><div class="grid-cards">`;
    for(const t of repPool){
      const tp=TYPES[t]; const canHire=S.staff.length<cap;
      html+=`<div class="gc"><h4>${tp.icon} ${t}</h4><div class="fn">${tp.role}</div>
        <div class="stat">Wage ${tp.wage}g/wk${tp.income?` · +${tp.income}g/wk`:''}</div>
        <button data-hire="${t}" ${canHire?'':'disabled'}>${canHire?'Hire (−'+tp.wage+'g)':'At cap'}</button></div>`;
    }
    html+=`</div>`;
    openOverlay('Staff — Personnel', html);
    $('#panelBody').querySelectorAll('button[data-fire]').forEach(b=> b.onclick=()=>{ fireStaff(+b.getAttribute('data-fire')); });
    $('#panelBody').querySelectorAll('button[data-hire]').forEach(b=> b.onclick=()=>{ hireStaff(b.getAttribute('data-hire')); });
  }
  function hireStaff(type){
    if(S.staff.length>=STAFF_CAP[S.phase]) return;
    const w=TYPES[type].wage; if(S.gold<w) { toast('Not enough gold for onboarding'); return; }
    S.gold-=w; const s=makeStaff(type); S.staff.push(s);
    logLine('', `Hired ${s.name} (${type}).`); toast(`Hired ${s.name}`);
    openStaff(); updateSidebar();
  }
  function fireStaff(i){
    const s=S.staff[i]; if(!s||s.fixed) return;
    S.staff.splice(i,1); S.axis.sl-=6; S.fear-=2; clampAll();
    logLine('bad', `Let go ${s.name}. The others noticed.`); toast(`${s.name} let go`);
    openStaff(); updateSidebar();
  }

  function openManual(){
    openOverlay('Field Manual', `<div class="manual">
      <h3>The job</h3>
      <p>You have 14 weeks across 4 phases. Keep four resources alive, then survive <b>The Review</b> in Phase 4. Where you land is decided by four <em>hidden</em> axes you never see directly: <b>Dungeon State</b>, <b>Staff Loyalty</b>, <b>Dark Lord Standing</b>, and <b>Gerald's Arc</b> (who you're becoming). Your choices move them silently.</p>
      <h3>Resources</h3>
      <ul>
        <li><b>Gold</b> — build &amp; wages. Hit 0 for too long and it's insolvency.</li>
        <li><b>Fear</b> — monster morale/menace. Healthy 35–55. Too low → unrest; too high → resignations.</li>
        <li><b>Compliance</b> — the IDRB's opinion. Drops below thresholds and the letters start.</li>
        <li><b>Reputation</b> — public perception. Drives income and which staff will join.</li>
      </ul>
      <h3>Tensions</h3>
      <p>High Fear keeps staff in line but poisons Compliance. Income rooms tend to hurt Compliance; Compliance rooms make no gold. Raising Reputation raises income <em>and</em> the tier of adventurers who show up. There is no free option — that's the point.</p>
      <h3>Tips</h3>
      <ul>
        <li>Build a Filing Room early; it steadies Compliance.</li>
        <li>Watch the sidebar notes — they warn you before a threshold bites.</li>
        <li>Events remember. A flag set in Week 2 can surface at The Review.</li>
        <li>Every run reshuffles your boss, your crisis, your staff, your floors, and which rooms exist.</li>
      </ul>
    </div>`);
  }

  /* ---------------- toast ---------------- */
  let toastTimer=null;
  function toast(msg){
    let t=$('.toast'); if(!t){ t=document.createElement('div'); t.className='toast'; document.body.appendChild(t); }
    t.textContent=msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove('show'),1600);
  }

  /* ---------------- wire chrome ---------------- */
  $('#panelClose').onclick=closeOverlay;
  $('#overlay').addEventListener('click', e=>{ if(e.target.id==='overlay') closeOverlay(); });
  $('#btnFacilities').onclick=openFacilities;
  $('#btnStaff').onclick=openStaff;
  $('#btnManual').onclick=openManual;
  document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeOverlay(); });

  render();
})();

# The kampung school: learning English

Agreed with the owner on 2026-10-26 (questions Q1–Q4). The owner wants a push
for residents to learn English and converse in it, starting with a primary
school. Like everything else, residents meet it in-world and are never told
how it works. Where the owner didn't decide a detail, Claude drafted it under
the owner's standing "you draft, be sensible"; those drafts are marked
*drafted*.

## Building it (Q1)

- **Mr Lim directs it.** He announces the school on the board, and it's built
  through his paid odd jobs: about twelve hour-long jobs. Jobs from the same
  odd-jobs system (docs/design/subsistence.md) for the materials:
  - clear the ground;
  - carry planks from the lorry stop;
  - raise the posts;
  - put up the attap roof;
  - make benches.
  
  Each is paid from his purse, so villagers earn while it goes up. Mr Lim buys
  the materials off the lorry himself. It's done when the jobs are.
- **Where:** the schoolhouse is a new place in the open ground near the village
  head's house (*drafted*).
- **The teacher:** a village character from town, with a scripted body and a few
  cheap thinking lines a day, like Pak Osman. *Drafted:* Miss de Souza, a
  Eurasian teacher, who cycles in on weekday mornings and goes home in the
  evening after the adult class.

## Who learns (Q2)

- **Children:** primary school on weekday mornings, 08:00 to 12:00, free.
  - Aminah (12) and Hassan (8) are of age.
  - A child at school is busy there, as an adult is on a shift.
- **Adults:** an evening English class, about 19:00 to 20:00 on weekdays, for any
  grown-up who wants it. *Drafted:* 5¢ a lesson, paid to the teacher.
- **English becomes a skill,** with the same levels as fishing, farming and
  cooking. It's learned in class, by speaking it with someone who knows it
  better, and from family through `teach`.

## What makes English worth learning (Q3: all four)

1. **It pays** (Q4: all four reasons):
   - **Travellers on the road:** many on the coast road are clerks, servicemen and
     town folk who speak English. They buy a little more, and pay a little more,
     where whoever is serving can talk with them.
   - **Reading the town's prices:** Pak Osman's wholesaler prints price lists
     and receipts in English. Someone who can read them knows the town price, so
     he can't haggle them as hard: his prices come nearer his lower bound.
   - **Work that needs it:** some paid work asks for English, such as Mr Lim's
     ledgers and letters to the town office, or minding the school. It's
     better-paid but rarer.
   - **Letters and forms:** government forms, licences and letters come in
     English. Those who can read them help neighbours for a small fee. This comes
     with the later legal system and official letters.
2. **The skill shows in speech.** A resident's English level sets how much they
   can use, and their card line changes as they learn:
   - "a few words of English";
   - "enough English to get by";
   - "you speak English well".
   
   They use English with those who share it, as far as their level allows.
3. **Parents and Mr Lim urge it.** Mr Lim's notices and Miss de Souza encourage
   school. Parents' cards come to want their children to learn English for a
   better life (Fatimah for Aminah and Hassan).
4. **Children bring it home.** Pupils use their English at home and teach their
   families a little, so it spreads through the kampung.

## Order and cost

- **Order:** this comes after the mechanics in docs/design/subsistence.md, because
  it needs Mr Lim's odd jobs and his visible body, and before his thinking head.
- **Cost:** the teacher's head uses a few short calls a weekday (*estimate*), within
  the town's daily cap. Children at school think less often, as they would on a
  shift.
- **Save:** the school place, its build progress, the teacher's state and the new
  English skill each take the next save version, with an upgrade step.

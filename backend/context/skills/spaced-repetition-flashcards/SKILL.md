---
name: spaced-repetition-flashcards
description: Turn study material into Anki-style spaced-repetition flashcards — extract Q/A pairs with run_python, export CSV/APKG, deliver a download URL.
tags: flashcards, anki, study, spaced-repetition, learning
---

# Spaced-Repetition Flashcards

Goal: convert study material (notes, an article, a PDF, a topic) into
high-quality spaced-repetition flashcards and deliver them as an importable
file (CSV for any app, or `.apkg` for Anki).

## When to use

- "Make flashcards from this", "turn these notes into Anki cards", "help me
  study X with spaced repetition".

## Steps

1. **Gather the source.**
   - Pasted text / a topic: use it directly (or `search_web` + `browse_web` to
     research a topic the user named).
   - A file in the sandbox: `read_sandbox_file`. For PDFs, extract text first
     (the sandbox has poppler/`pdftotext` — `run_terminal "pdftotext in.pdf -"`).

2. **Design good cards (principle: one fact per card).**
   - Prefer atomic Q→A pairs; avoid cramming lists into one answer.
   - Use cloze deletions for definitions/sequences where helpful.
   - Phrase questions so the answer is unambiguous and recallable.
   - Add a "Source/Topic" tag per card for organization.

3. **Extract Q/A pairs with `run_python`.** Have the model generate the pairs
   from the material, then write them to a structured file. Example:
   ```python
   import csv
   cards = [
       ("What does TCP guarantee?", "Reliable, ordered, error-checked delivery of a byte stream."),
       ("{{c1::DNS}} resolves domain names to IP addresses.", ""),  # cloze
   ]
   with open("/home/user/flashcards.csv", "w", newline="", encoding="utf-8") as f:
       w = csv.writer(f)
       for q, a in cards:
           w.writerow([q, a])
   print(f"Wrote {len(cards)} cards")
   ```
   CSV (Front,Back) imports into Anki, Quizlet, and most apps.

4. **Optional: build a real Anki `.apkg`.** Install the library, then generate:
   ```
   install_packages -> pip: genanki
   ```
   ```python
   import genanki, random
   model = genanki.Model(random.randrange(1<<30, 1<<31), "Basic",
       fields=[{"name":"Front"},{"name":"Back"}],
       templates=[{"name":"Card 1","qfmt":"{{Front}}","afmt":"{{FrontSide}}<hr id=answer>{{Back}}"}])
   deck = genanki.Deck(random.randrange(1<<30, 1<<31), "Study Deck")
   for q, a in cards:
       deck.add_note(genanki.Note(model=model, fields=[q, a]))
   genanki.Package(deck).write_to_file("/home/user/deck.apkg")
   print("wrote deck.apkg")
   ```

5. **Verify the output exists.**
   `run_terminal "ls -la /home/user/flashcards.csv /home/user/deck.apkg"` and
   check the card count printed by the script is sensible (not 0, not 500 from
   a short note).

6. **Deliver the download URL.** Call `get_sandbox_file_url` on the file
   (`.apkg` for Anki users, `.csv` otherwise) and give the user the link plus a
   one-line import instruction (Anki: File -> Import).

## Gotchas

- Quality over quantity: 20 sharp cards beat 100 vague ones. Don't pad.
- One fact per card — split compound answers.
- Escape quotes/commas in CSV (the `csv` module handles this; don't hand-format).
- For cloze cards in `.apkg`, use Anki's Cloze model, not the Basic model above.
- Don't lose unicode — write files with `encoding="utf-8"`.

## Deliver

The download URL (CSV and/or APKG), the card count, and a one-line note on how
to import.

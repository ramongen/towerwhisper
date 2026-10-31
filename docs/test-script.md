# TowerWhisper — scenariu de test pentru mentori

Toate rezultatele de mai jos au fost verificate pe aplicația pornită în Docker (31 oct 2026),
cu frazele trimise exact cum sunt scrise aici. Mesajele alertelor rămân în engleză, ca în aplicație.

## Pregătire (o singură dată)

1. Deschideți ecranul controlorului: `http://localhost:8080` (sau portul afișat de `start.cmd`),
   în Chrome sau Edge, cont `atc@towerwhisper.app` / `passpass`. Acceptați microfonul.
2. Deschideți panoul de demo pe telefon: `http://<ip-laptop>:8080/demo`.
3. Pe panoul de demo: **TARGET → Selected**, **MODE → ONCE**, **COMMS TIMER → 30 / 60 min**.
   Treceți pe **15 / 30 s** doar la testul 9: cu limitele de 15 / 30 s, toate avioanele cu care
   nu vorbiți intră în NO CONTACT după 15 s.
4. Cu TARGET pe Selected, eroarea se aplică avionului selectat pe radar; fără selecție, avionului
   căruia îi vorbiți. Dați click pe avionul căruia urmează să-i vorbiți sau pe un loc gol.

Sunteți **CRAIOVA APPROACH**. Țineți apăsat **Space**, vorbiți, eliberați.

| Avion | Indicativ radio | Tip |
| --- | --- | --- |
| ROT301 | TAROM 301 | AT76 |
| WZZ44 | WIZZ 44 | A21N |
| ROT612 | TAROM 612 | B738 |

## Teste

În modul ONCE, fiecare eroare se armează din panou înainte de frază și se consumă la prima transmisie.

| # | Pe panoul de demo | Spuneți | Rezultat așteptat |
| --- | --- | --- | --- |
| 1 | nimic | `TAROM 301, descend altitude 4000 feet, turn left heading 080` | Readback corect, bifă verde **READBACK OK**, nicio alertă |
| 2 | Wrong altitude | `TAROM 612, descend altitude 6000 feet` | **HEARBACK MISMATCH** (roșu): `ROT612 cleared 6000 ft, read back 8000 ft` |
| 3 | Wrong turn direction | `WIZZ 44, descend altitude 5000 feet, turn left heading 240, reduce speed 220` | **HEARBACK MISMATCH** (roșu): `WZZ44 cleared LEFT heading 240, read back RIGHT` |
| 4 | Incomplete readback | `TAROM 301, descend altitude 4000 feet, turn left heading 080` | **READBACK INCOMPLETE** (galben): `ROT301 read back heading 080; 4000 ft missing` |
| 5 | No response | `TAROM 612, descend altitude 6000 feet` | Pilotul tace; după 8 s **NO RESPONSE** (galben): `No readback from ROT612 8 s after: 6000 ft` |
| 6 | Turn wrong way | `TAROM 612, turn left heading 200` | Readback corect, dar avionul virează la dreapta; după câteva secunde **WRONG TURN** (roșu): `ROT612 cleared LEFT heading 200, turning RIGHT through …°` |
| 7 | Wrong vertical | `WIZZ 44, descend altitude 5000 feet, turn left heading 240, reduce speed 220` | Avionul urcă în loc să coboare: **WRONG VERTICAL** (roșu): `WZZ44 cleared descent to 5000 ft, climbing at … ft/min` |
| 8 | Level bust | `TAROM 612, descend altitude 6000 feet` | Avionul coboară fără să încetinească; după ~2 min (la viteza 1×) **LEVEL BUST** (roșu): `ROT612 will bust 6000 ft in … s` |
| 9 | COMMS TIMER 15 / 30 s, click pe TAROM 612 pe radar, apoi **Age to 30 s** | `TAROM 612, descend altitude 6000 feet` | Înainte: TAROM 612 roșu, **NO CONTACT** (roșu): `No communication with ROT612 for 3x s (limit 30 s)`. După transmisie, alerta dispare singură. Reveniți la 30 / 60 min. |
| 10 | Wrong runway | `WIZZ 44, cleared ILS approach runway two six` | **HEARBACK MISMATCH** (roșu): `WZZ44 cleared ILS runway 26, read back runway 08` |

Între teste: **RESOLVE** pe alertă sau **RESET SCENARIO** pe panou.

## Sfaturi pentru microfon

- Țineți Space apăsat o clipă înainte să vorbiți și eliberați după ultimul cuvânt
  (înregistrările sub 300 ms se ignoră).
- Începeți cu indicativul (`TAROM 301`, `WIZZ 44`), apoi instrucțiunea, în ritm normal, ca pe frecvență.
- Cifrele pe rând, ca în ATC: „zero eight zero”, „four thousand”; „niner” e înțeles.
- Căști cu microfon sau microfon USB; laptopul prinde sala.
- Microfonul merge doar pe `localhost` sau HTTPS. Dacă nu merge, butonul cu tastatura din bara PTT
  permite scrierea frazei.

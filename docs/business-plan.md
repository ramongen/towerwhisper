# TowerWhisper — plan de implementare și clienți

## 1. Cine sunt clienții

**EASA nu e client, ci autoritatea care stabilește regulile.** EASA nu operează trafic aerian și nu cumpără sisteme pentru controlori. Cine plătește sunt **furnizorii de servicii de navigație aeriană (ANSP)**, companiile care angajează controlorii. În România, ROMATSA, inclusiv turnul de la Craiova.

| Actor | Rol pentru noi | Exemple |
| --- | --- | --- |
| ANSP | **Clientul principal**: cumpără și folosește sistemul | ROMATSA (RO), DFS (DE), DSNA (FR), ENAV (IT), ENAIRE (ES) |
| Centre de pregătire ATC | **Primul client realist**: simulatoare pentru controlori în formare, fără risc operațional | centrele de pregătire ale ANSP-urilor, școli de controlori |
| EUROCONTROL | Operator (centrul de control Maastricht, MUAC) și partener de cercetare | EUROCONTROL MUAC |
| Furnizori de sisteme ATM | **Canal de distribuție**: ne integrează ca modul în stațiile lor | Frequentis, Thales, Indra |
| SESAR Joint Undertaking | Finanțare și validare în programe de cercetare UE | apeluri SESAR / Horizon Europe |
| EASA | **Regulatorul**: stabilește cum se atestă echipamentele ATM și ce cerințe au ANSP-urile | — |

Echipamentele ATM/ANS din UE au un cadru de atestare a conformității, stabilit prin Regulamentul delegat (UE) 2023/1768, aplicabil din septembrie 2023 ([EASA](https://easa.europa.eu/en/domains/air-traffic-management/atmans-equipment-attestation)). Ca TowerWhisper să ajungă în operațiuni reale trebuie să treacă prin acest cadru, de regulă împreună cu ANSP-ul și cu un furnizor de sisteme.

**Cercetare similară:** proiectul SESAR HAAWAII (DLR, NATS, Isavia, 2020–2022) a construit un asistent de detecție a erorilor de readback care, în teste offline, a prins peste 80% din erori ([CORDIS](https://cordis.europa.eu/article/id/442201-better-automatic-speech-recognition-for-safer-air-traffic-control)). Asta validează problema. Diferența noastră: verificăm și **execuția** manevrei pe radar și **timpul de la ultima comunicare**, nu doar repetarea, într-un produs ușor de instalat.

## 2. Cum se implementează

**Pe serverele clientului, nu pe ale noastre.** Rețelele ATC sunt izolate de internet, iar înregistrările vocale sunt date sensibile. Instalăm aplicația din Docker pe un server în data center-ul ANSP-ului, câte o instanță per centru de control sau turn.

Diagrama de implementare (de desenat în prezentare), totul în **rețeaua ANSP, on-premise, izolată de internet**:

- Intrări existente → server TowerWhisper:
  - **Sistemul de voce (VCS):** audio pe fiecare frecvență, preluat pasiv;
  - **Radar (ASTERIX):** pozițiile avioanelor;
  - **Planuri de zbor (FDP):** callsign, rută, nivel.
- **Server TowerWhisper:** recunoaștere vocală locală, parser + verificări de siguranță, bază de date + jurnal de audit, în Docker, per centru, fără AI în cloud.
- **SSO al ANSP (Active Directory)** → server: conturi și roluri.
- Server → ieșiri:
  - **ecranul controlorului:** alerte advisory;
  - **dashboard supervizor:** starea sectoarelor;
  - **analiză de siguranță:** statistici, investigații.

| În prototip | În produs | De ce |
| --- | --- | --- |
| Controlorul apasă Space în browser | Audio preluat pasiv din sistemul de voce (VCS), pe fiecare frecvență, inclusiv vocea piloților | Controlorul nu face nimic în plus |
| Trafic simulat | Date radar reale în formatul european ASTERIX, plus planurile de zbor | Verificăm avioanele reale |
| Whisper și Claude prin API, în cloud | Model de recunoaștere vocală rulat local, antrenat pe frazeologia ATC; fără LLM extern | Datele nu ies din rețea |
| Un utilizator, fără cont | Conturi prin SSO / Active Directory | Fără parole în plus |
| Ecran separat în browser | Întâi ecran advisory auxiliar; apoi integrat în stația de lucru prin furnizorul ei | Integrarea directă o fac furnizorii ATM |

**Cum ajunge interfața la controlor:**

1. Pregătire și shadow mode: în simulatoare rulează interfața completă; în shadow mode controlorul nu vede nimic, alertele le vede doar echipa de siguranță.
2. Primul pas operațional: un ecran mic, auxiliar, la poziția de lucru, doar cu alertele active și timerele de comunicare, fără radar propriu (controlorul are deja radarul certificat).
3. Țintă pe termen lung: alertele apar direct în radarul existent (eticheta avionului colorată, câmp „LC”), integrate de furnizorul sistemului ATM.

Produsul are trei interfețe: interfața completă (pregătire și demo), panoul minimalist de alerte pentru controlor, dashboard-ul pentru supervizori și echipa de siguranță.

**Roluri:** controlor (alertele sectorului lui), supervizor (toate sectoarele, pragurile), analist de siguranță (istoric și statistici), administrator (instalare, actualizări, jurnal de acces).

## 3. Etapele de lansare

Duratele sunt estimări, nu angajamente.

| Etapă | Ce livrăm | Client | De ce în ordinea asta |
| --- | --- | --- | --- |
| **0. Prototip** (acum) | Aplicația de la hackathon, trafic simulat | — | Dovedim că merge |
| **1. Pregătire și analiză** (estimat 3–6 luni) | Modul pentru simulatoare de pregătire; analiză offline a înregistrărilor pentru departamentul de siguranță | Centre de pregătire, departamente de siguranță | Fără trafic real în joc, cerințe mult mai ușoare. Primele venituri și date de antrenament |
| **2. Shadow mode** (estimat 6–12 luni) | Ascultă frecvența și radarul reale; alertele doar se salvează și se compară | Un ANSP pilot (ideal ROMATSA, un sector) | Măsurăm acuratețea și alarmele false fără risc; dosarul de siguranță |
| **3. Advisory operațional** (estimat 12–24+ luni) | Alertele apar controlorului pe un sector | Același ANSP | Evaluarea de siguranță a ANSP și atestarea în cadrul EASA |
| **4. Scalare** | Mai multe sectoare și ANSP-uri, modul în sistemele furnizorilor | ANSP-uri din UE, prin furnizori | Furnizorii ne duc la clienți |

Finanțarea etapelor 2–3: programele SESAR / Horizon Europe, în parteneriat cu un ANSP.

## 4. Model de business, scalare și riscuri

**Venituri:** licență anuală per poziție de lucru sau per sector, cu instalare, mentenanță și suport; licență per centru pentru modulul de pregătire și analiza offline; granturi SESAR / Horizon Europe. Prețurile se stabilesc cu un client pilot, nu le inventăm acum.

**Scalare tehnică:** un server per centru, un proces de recunoaștere vocală per frecvență; un sector nou = încă un proces. Același produs în Docker merge de la un laptop la un cluster în data center-ul ANSP. Modelul de voce se re-antrenează pe datele fiecărui ANSP.

| Risc | Răspuns |
| --- | --- |
| Certificarea durează ani | Începem cu pregătire și analiză offline, venit fără certificare operațională |
| Achizițiile ANSP sunt lente | Granturi SESAR și furnizori de sisteme deja contractați |
| Acuratețea pe accente și zgomot | Antrenare pe datele ANSP; shadow mode măsoară performanța reală |
| Alarme false | Praguri reglabile, persistență înainte de alertă, măsurare în shadow mode |
| Înregistrările vocale sunt sensibile | Totul on-premise, acces pe roluri, jurnal de acces, GDPR |
| Concurență (HAAWAII, furnizori mari) | Diferențiere prin execuție și timp de comunicare; sau modul pentru un furnizor mare |

## 5. Răspunsul de 30 de secunde pentru mentori

„Clienții noștri sunt furnizorii de servicii de trafic aerian, ca ROMATSA. EASA e regulatorul: ne spune ce trebuie să dovedim ca să intrăm în operațiuni. Sistemul se instalează la client, în rețeaua lui, fără cloud, și ascultă pasiv frecvența și radarul existente. Începem cu centrele de pregătire și cu analiza înregistrărilor, apoi shadow mode cu un ANSP pilot și abia după aceea operațional, prin furnizorii de sisteme ATM.”

## Surse

- [EASA — ATM/ANS Equipment Attestation](https://easa.europa.eu/en/domains/air-traffic-management/atmans-equipment-attestation)
- [CORDIS — HAAWAII](https://cordis.europa.eu/article/id/442201-better-automatic-speech-recognition-for-safer-air-traffic-control)

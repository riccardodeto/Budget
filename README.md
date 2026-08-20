# Spese Local

Applicazione locale apribile da browser con doppio click su `index.html`.

## Come si usa

1. Genera o esporta un backup JSON compatibile con l'app.

2. Apri:

```text
index.html
```

3. Tocca il pulsante archivio in alto a destra e scegli `Importa dati`.
4. Seleziona il file JSON dal dispositivo o da iCloud Drive.

Da quel momento i dati vengono salvati nel browser con `localStorage`.

In alternativa, per provarla con un server locale:

```bash
python3 -m http.server 4177
```

Poi apri:

```text
http://127.0.0.1:4177/
```

## Viste disponibili

- `Overview`: KPI del mese con confronto rispetto alla media, patrimonio totale, conti, investimenti e ultime transazioni.
- `Grafici`: grafici cliccabili per andamento patrimonio, composizione conti/investimenti, spese per categoria, distribuzione a torta, spese vs entrate, spesa giornaliera, saldi per conto, valori investimento, andamento ETF/asset selezionato e top spese.
- `Anno`: riepilogo annuale con spese, entrate, bilancio, patrimonio, categorie principali con percentuale, patrimonio mese per mese e medie mensili con stipendio su 14 mensilita'.
- `Dati`: contiene tre sezioni interne per movimenti, patrimonio e setup.

La navigazione principale e' una tab bar fissa in basso a 4 pulsanti, pensata per Safari su iPhone. Dentro `Dati` puoi passare tra `Movimenti`, `Patrimonio` e `Setup`.

I filtri in alto sono nascosti di default: usa il pulsante con l'icona a imbuto per aprire anno, mese, categoria e conto. Accanto trovi il cambio tema chiaro/scuro e il menu archivio per import/export. All'avvio l'app usa l'ultimo anno/mese disponibile e include tutte le categorie e tutti i conti.

## Perche' non importa direttamente `.numbers`

Una pagina HTML locale non puo' eseguire Apple Numbers o AppleScript e non puo' convertire in modo affidabile il formato iWork `.numbers`, che e' proprietario. Per questo la conversione avviene con uno script locale macOS, che:

- apre una copia del file Numbers;
- esporta XLSX;
- normalizza transazioni, conti, investimenti e patrimonio;
- produce `local_app_data.json`.

Il file Numbers originale non viene modificato.

## Cosa puoi modificare dall'app

- Spese e guadagni.
- Categorie.
- Conti correnti o contanti.
- Saldi di fine mese per ogni conto.
- Investimenti e rendimento.
- Nuove anagrafiche: categorie, conti, investimenti.

Nello storico puoi toccare una riga per modificarla. Il cestino resta separato per eliminare. Quando modifichi, si apre un pannello unico con tutti i campi attuali: puoi cambiare solo i valori necessari e salvare in una volta sola.

Ogni modifica resta salvata localmente nel browser. Usa il menu archivio per esportare un backup JSON.

## Nota backup

`localStorage` e' comodo ma vive nel profilo del browser. Ogni tanto esporta un backup JSON dal menu archivio, soprattutto prima di pulire dati del browser o cambiare Mac.

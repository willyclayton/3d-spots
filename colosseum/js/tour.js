// The Colosseum guided tour: round the outside, through the cut, down to the
// basement, out to the neighbours, and back to 90 CE.
export function colosseumTour(app, { place, view, cutaway }) {
  return [
    { title: 'The valley of the Colosseum', dur: 10, run: view('hero', { era: 'today' }),
      text: 'Between the Palatine, the Caelian and the Oppian hills, where Nero had a private lake.' },
    { title: 'The Flavian Amphitheatre', dur: 11, run: place('colosseum'),
      text: 'Opened by Titus in 80 CE: 188 by 156 m, for some 50,000 spectators.' },
    { title: 'The outer wall', dur: 10, run: place('facade'),
      text: 'Three arcades of Tuscan, Ionic and Corinthian columns, and an attic.' },
    { title: 'Numbered gates', dur: 9, run: place('arch-lii'),
      text: 'Arches I to LXXVI: your token named the gate, the stairs and the sector.' },
    { title: 'Propping up the ruin', dur: 9, run: place('stern'),
      text: 'In 1807 a brick wedge saved the leaning end of the outer wall.' },
    { title: 'The fallen side', dur: 10, run: place('inner-ring'),
      text: 'Earthquakes brought down the south side; its stone was quarried for centuries.' },
    { title: 'Cutting it open', dur: 12, run: cutaway({ target: 'amph', plane: 'x', offset: 6.5, flip: false }),
      text: 'Corridors ring the building; stairs climb through the vaults to the seats.' },
    { title: 'Seats by rank', dur: 10, run: place('cavea'),
      text: 'Senators at the front, citizens above, the poor at the top in wooden seats.' },
    { title: 'The arena', dur: 9, run: place('arena'),
      text: 'Harena means sand: it covered a wooden floor full of trapdoors.' },
    { title: 'The hypogeum', dur: 11, run: place('hypogeum'),
      text: 'Corridors, cages and lifts that raised animals and fighters to the arena.' },
    { title: 'The Arch of Constantine', dur: 10, run: place('arch-constantine'),
      text: 'Dedicated in 315 CE, much of it reused from older monuments.' },
    { title: 'The gladiators’ school', dur: 9, run: place('ludus-magnus'),
      text: 'The Ludus Magnus had its own small arena for training.' },
    { title: 'As built, c. 90 CE', dur: 13, run: view('hero', { era: 'built' }),
      text: 'Complete, with the marble seats and the sanded arena floor.' },
    { title: 'Your turn', dur: 0, run: view('default', { era: 'today' }),
      text: 'Use Places, Cutaway, Walk and 90 CE to explore on your own.' },
  ];
}

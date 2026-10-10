// Arena looks (Clash-Royale style): each arena repaints the fight (floor, walls, floor pattern)
// and the menus around it (page background, the lobby stage, neon rings). Pure data, no DOM.
// Which arena you are in is decided by progress.js (arenaFor); this file only says how it looks.
const STARS = 'radial-gradient(1.5px 1.5px at 12% 18%, #fff 50%, transparent 51%), radial-gradient(1.5px 1.5px at 78% 9%, #fff 50%, transparent 51%), radial-gradient(1px 1px at 33% 41%, #fff 50%, transparent 51%), radial-gradient(1px 1px at 88% 36%, #fff 50%, transparent 51%), radial-gradient(1.5px 1.5px at 56% 22%, #fff 50%, transparent 51%), radial-gradient(1px 1px at 8% 63%, #fff 50%, transparent 51%), radial-gradient(1px 1px at 67% 58%, #fff 50%, transparent 51%), radial-gradient(1.5px 1.5px at 92% 74%, #fff 50%, transparent 51%), radial-gradient(1px 1px at 24% 86%, #fff 50%, transparent 51%)';

export const THEMES = {
  night: {
    sky: `${STARS}, linear-gradient(180deg, #0F0F23 0%, #111B38 55%, #14284A 100%)`,
    floor: '#203A5E', faces: ['#2E4C77', '#1B3254', '#14284A', '#10213D'], pattern: 'grid', rings: ['#4CC9F0', '#FF2D55'], back: '#0E1D3A',
  },
  canyon: {
    sky: 'linear-gradient(180deg, #2A1530 0%, #7A3A2A 50%, #D9783A 100%)',
    floor: '#D9A25B', faces: ['#E8B56E', '#A86A2E', '#8E5524', '#6E3F18'], pattern: 'tiles', rings: ['#FFCC33', '#FF6B3D'], back: '#8E5524',
  },
  frost: {
    sky: 'linear-gradient(180deg, #0E2340 0%, #2F6FA8 55%, #A9D5FF 100%)',
    floor: '#86BADC', faces: ['#D6EEFF', '#7FB2D6', '#6699C2', '#4E7FA8'], pattern: 'ice', rings: ['#7FE7FF', '#C890FF'], back: '#5C93BD',
  },
  jungle: {
    sky: 'linear-gradient(180deg, #0B2A1A 0%, #1F5A32 55%, #3E8E4A 100%)',
    floor: '#3E8E4A', faces: ['#6BB85A', '#2E6E3A', '#245A2E', '#1A4423'], pattern: 'grass', rings: ['#A6FF4D', '#FFCC33'], back: '#1F4D2A',
  },
  lava: {
    sky: 'linear-gradient(180deg, #120808 0%, #3A0E0E 55%, #7A1E10 100%)',
    floor: '#2A1A1A', faces: ['#4A2A26', '#2A1414', '#221010', '#160A0A'], pattern: 'cracks', rings: ['#FF7A2F', '#FFD23F'], back: '#1E0E0C',
  },
  // shop looks (bought with gems): your battles and your lobby stage use them instead of the trophy arena
  candy: {
    sky: 'linear-gradient(180deg, #FF8FC1 0%, #FFC6E0 55%, #BFF3FF 100%)',
    floor: '#FFC6DD', faces: ['#FFFFFF', '#FFE3EF', '#FFD1E6', '#F7B8D3'], pattern: 'candy', rings: ['#7FE7FF', '#FF4D8D'], back: '#F06AA8',
  },
  pirate: {
    sky: 'linear-gradient(180deg, #0B4F8A 0%, #1E9BE0 55%, #7FD3FF 100%)',
    floor: '#C9752E', faces: ['#8A4B1E', '#6E3A16', '#5E3112', '#4A260E'], pattern: 'planks', rings: ['#FFD23F', '#4CC9F0'], back: '#1E9BE0',
  },
  stadium: {
    sky: 'radial-gradient(40% 25% at 15% 8%, rgba(255,255,220,0.35), transparent), radial-gradient(40% 25% at 85% 8%, rgba(255,255,220,0.35), transparent), linear-gradient(180deg, #0E1530 0%, #1D3A6E 55%, #2E5FA0 100%)',
    floor: '#3FAE49', faces: ['#FFCC33', '#2B3550', '#232B44', '#1A2036'], pattern: 'pitch', rings: ['#FFFFFF', '#FFCC33'], back: '#1D2A4A',
  },
  temple: {
    sky: 'linear-gradient(180deg, #2A1A0E 0%, #8A5A2A 55%, #F2B45A 100%)',
    floor: '#D8B47A', faces: ['#E8C98E', '#B48A52', '#9E7744', '#7E5C32'], pattern: 'temple', rings: ['#3FE0D0', '#FFB23F'], back: '#A86A2E',
  },
  chess: {
    sky: 'radial-gradient(60% 40% at 50% 20%, rgba(255,214,122,0.18), transparent), linear-gradient(180deg, #06140E 0%, #0E2A1C 55%, #164A30 100%)',
    floor: '#EDE3CF', faces: ['#6B4226', '#4A2C18', '#3E2414', '#2E1A0E'], pattern: 'chess', rings: ['#FFD27A', '#FF5C5C'], back: '#0E2A1C',
  },
  neon: {
    sky: 'radial-gradient(60% 40% at 50% 30%, rgba(255,43,214,0.25), transparent), linear-gradient(180deg, #05030F 0%, #120E30 60%, #1C1048 100%)',
    floor: '#0D0B1E', faces: ['#2A1F5C', '#16113A', '#120E30', '#0A0820'], pattern: 'neon', rings: ['#00F0FF', '#FF2BD6'], back: '#120E30',
  },
  ocean: {
    sky: 'linear-gradient(180deg, #032B4F 0%, #0B4F8A 55%, #3FB4E8 100%)',
    floor: '#1D7FB8', faces: ['#5CC8F0', '#1A6A9E', '#155A88', '#0E3F63'], pattern: 'waves', rings: ['#7FFFD4', '#FFD23F'], back: '#155A88',
  },
  space: {
    sky: `${STARS}, radial-gradient(60% 40% at 70% 20%, rgba(200,144,255,0.35), transparent), linear-gradient(180deg, #05030F 0%, #1A0E3A 55%, #3B1A6E 100%)`,
    floor: '#1E1440', faces: ['#4A3A8A', '#2A1E5A', '#22184A', '#160F33'], pattern: 'stars', rings: ['#C890FF', '#4CC9F0'], back: '#140C2E',
  },
};

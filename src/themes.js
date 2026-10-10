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
    floor: '#FFD1E6', faces: ['#FFF0F7', '#FF8FC1', '#F06AA8', '#C94C88'], pattern: 'dots', rings: ['#7FE7FF', '#FF4D8D'], back: '#F06AA8',
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

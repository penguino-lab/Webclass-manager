// Shared palette for WebClass, frames, and extension pages.
(() => {
  globalThis.WebClassPageThemes ||= Object.freeze([
    { id:'default', label:'デフォルト', gradient:'', text:'', border:'', accent:'', soft:'' },
    { id:'charcoal', label:'ブラック', gradient:'linear-gradient(115deg,#25262b 0%,#4b4d56 50%,#292a30 100%)', text:'#f6f6f8', border:'#646671', accent:'#555360', soft:'#f0eef5' },
    { id:'forest', label:'グリーン', gradient:'linear-gradient(115deg,#172e2a 0%,#36594d 50%,#203831 100%)', text:'#f4f7f5', border:'#48685d', accent:'#28624f', soft:'#e9f4ee' },
    { id:'red', label:'レッド', gradient:'linear-gradient(115deg,#4b1d2b 0%,#7b354b 50%,#4f2132 100%)', text:'#fbf4f6', border:'#92576b', accent:'#85364e', soft:'#f8eef1' },
    { id:'lightblue', label:'ライトブルー', gradient:'linear-gradient(115deg,#abd8ed 0%,#e0f4fc 50%,#94c9e1 100%)', text:'#20475b', border:'#88b9ce', accent:'#2b6886', soft:'#eaf6fb' },
    { id:'silver', label:'シルバー', gradient:'linear-gradient(115deg,#b7c1cb 0%,#eef1f5 48%,#a9b5c1 100%)', text:'#243545', border:'#a0afbd', accent:'#405b73', soft:'#eaf0f5' },
    { id:'gold', label:'ゴールド', gradient:'linear-gradient(135deg,#b49449 0%,#c6aa64 28%,#f4eac0 58%,#ac853e 100%)', text:'#362b1d', border:'#b39b69', accent:'#80624c', soft:'#faf5ed' }
  ].map(theme => {
    const palettes = {
      // Cards stay near-white; transparent layout containers reveal the canvas.
      charcoal: { canvas:'#f3f2f5', surface:'#fdfcfe', ink:'#302e38', muted:'#706b7b', line:'#d4cfdd', link:'#55505f', hover:'#403b4b', heading:'#e5e1eb' },
      forest: { canvas:'#f0f6f2', surface:'#fcfefc', ink:'#263e31', muted:'#617768', line:'#c4d8ca', link:'#28624f', hover:'#1b4939', heading:'#dcebe0' },
      red: { canvas:'#faf3f5', surface:'#fffafc', ink:'#4b303a', muted:'#7e6370', line:'#dfcbd2', link:'#85364e', hover:'#66243b', heading:'#f0dfe5' },
      lightblue: { canvas:'#f1f8fb', surface:'#fbfeff', ink:'#294754', muted:'#587585', line:'#c6dde8', link:'#2b6886', hover:'#204f66', heading:'#deeff7' },
      silver: { canvas:'#f1f5f8', surface:'#fcfdff', ink:'#293f52', muted:'#62798d', line:'#c8d5e0', link:'#405b73', hover:'#2c4359', heading:'#e0e8f0' },
      gold: { canvas:'#faf5ed', surface:'#fffdf9', ink:'#4a4a4a', muted:'#806e60', line:'#d7c4b7', link:'#a65a20', hover:'#654936', heading:'#f3e5d8' }
    };
    return Object.freeze({ ...theme, ...palettes[theme.id] });
  }));
  const keys = ['gradient','text','border','accent','soft','canvas','surface','ink','muted','line','link','hover','heading'];
  globalThis.WebClassTheme ||= Object.freeze({
    apply(id) {
      const theme = globalThis.WebClassPageThemes.find(theme => theme.id === id) || globalThis.WebClassPageThemes[0];
      const root = document.documentElement;
      root.dataset.wclTheme = theme.id;
      for (const key of keys) {
        if (theme[key]) root.style.setProperty(`--wcl-${key}`, theme[key]);
        else root.style.removeProperty(`--wcl-${key}`);
      }
      return theme;
    }
  });
})();

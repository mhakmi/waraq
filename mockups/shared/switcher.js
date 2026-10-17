// The corner bar. The URL hash holds the state, so a screenshot can ask for any of them:
//   index.html#direction=b&theme=dark&text=large&clean=1
// clean=1 hides the bar. The page defines window.renderBoard(root, direction).
const CHOICES = {
	direction: ['a', 'b'],
	theme: ['light', 'dark'],
	text: ['normal', 'large'],
};

function readState() {
	const parameters = new URLSearchParams(location.hash.slice(1));
	const state = { clean: parameters.get('clean') === '1' };
	for (const [key, values] of Object.entries(CHOICES)) {
		const value = parameters.get(key);
		state[key] = values.includes(value) ? value : values[0];
	}
	return state;
}

function writeState(state) {
	const parameters = new URLSearchParams();
	for (const key of Object.keys(CHOICES)) {
		parameters.set(key, state[key]);
	}
	if (state.clean) {
		parameters.set('clean', '1');
	}
	history.replaceState(null, '', '#' + parameters.toString());
}

function buildToolbar(state, onChange) {
	const copy = window.WARAQ.copy;
	const labels = {
		direction: { a: copy.board.directionNames.a, b: copy.board.directionNames.b },
		theme: { light: copy.switcher.light, dark: copy.switcher.dark },
		text: { normal: copy.switcher.normalText, large: copy.switcher.largeText },
	};
	const toolbar = document.createElement('div');
	toolbar.className = 'switcher';
	for (const [key, values] of Object.entries(CHOICES)) {
		const group = document.createElement('div');
		group.className = 'switcher-group';
		group.setAttribute('role', 'group');
		group.setAttribute('aria-label', copy.switcher[key]);
		for (const value of values) {
			const button = document.createElement('button');
			button.textContent = labels[key][value];
			button.setAttribute('aria-pressed', String(state[key] === value));
			button.onclick = () => onChange({ ...state, [key]: value });
			group.appendChild(button);
		}
		toolbar.appendChild(group);
	}
	return toolbar;
}

function render() {
	const state = readState();
	writeState(state);
	document.documentElement.classList.toggle('dark', state.theme === 'dark');
	document.documentElement.classList.toggle('text-large', state.text === 'large');

	document.querySelector('.switcher')?.remove();
	if (!state.clean) {
		document.body.appendChild(buildToolbar(state, (next) => {
			writeState(next);
			render();
		}));
	}
	window.renderBoard(document.getElementById('root'), state.direction);
}

window.addEventListener('hashchange', render);
window.addEventListener('DOMContentLoaded', render);

const switcherStyle = document.createElement('style');
switcherStyle.textContent = `
.switcher { position: fixed; inset-block-start: 12px; inset-inline-end: 12px; z-index: 1000; display: flex; gap: 8px;
	padding: 6px; border-radius: 12px; background: #15181e; box-shadow: 0 4px 16px rgb(0 0 0 / 0.3); }
.switcher-group { display: flex; gap: 2px; }
.switcher-group + .switcher-group { padding-inline-start: 8px; border-inline-start: 1px solid #3a3f4a; }
.switcher button { font: 500 13px system-ui, sans-serif; color: #d8d6d0; background: transparent; border: 0;
	border-radius: 8px; padding-block: 8px; padding-inline: 12px; cursor: pointer; }
.switcher button[aria-pressed="true"] { background: #f3efe6; color: #15181e; }
`;
document.head.appendChild(switcherStyle);

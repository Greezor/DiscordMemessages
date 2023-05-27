/**
 * @name Memessages
 * @author Greezor
 * @authorId 382062281623863298
 * @description Plays sound memes when receiving messages
 * @version 0.12.3
 * @donate https://boosty.to/greezor
 * @source https://github.com/Greezor/DiscordMemessages
 */

const React = BdApi.Webpack.getModule(m => m.createElement && m.cloneElement);

const Discord = {
	dispatcher: BdApi.Webpack.getModule(m => m.dispatch && m.subscribe),
	channelStore: BdApi.Webpack.getModule(m => m.getLastSelectedChannelId),
	userStore: BdApi.Webpack.getModule(m => m.getCurrentUser && m.getUser),
	relationshipStore: BdApi.Webpack.getModule(m => m.isBlocked && m.getFriendIDs),
	navigateTo: BdApi.Webpack.getModule(
		BdApi.Webpack.Filters.byStrings(`"transitionTo - Transitioning to "`),
		{ searchExports: true }
	),
};

const $ = (() => {
	const el = (tag, attrs = {}, children = []) => {
		let elem = document.createElement(tag);

		for(let [ attr, value ] of Object.entries(attrs))
			elem.setAttribute(attr, value);

		if( Array.isArray(children) )
			for(let child of children)
				elem.append( el(...child) );
		else
			elem.innerHTML = children;

		return elem;
	};

	const find = (selector, parent = null) => (parent ?? document).querySelector(selector);

	const findAll = (selector, parent = null) => (parent ?? document).querySelectorAll(selector);

	const eventListeners = [];

	const on = (target, event, listener, options) => {
		target?.addEventListener(event, listener, options);
		eventListeners.push({ target, event, listener, options });
	};

	const off = (target, event) => {
		for(let [ i, eventListener ] of eventListeners.entries()){
			if(
				(
					!target
					||
					eventListener.target === target
				)
				&&
				(
					!event
					||
					eventListener.event === event
				)
			){
				eventListener.target?.removeEventListener(
					eventListener.event,
					eventListener.listener,
					eventListener.options,
				);
				
				eventListeners.splice(i, 1);
			}
		}
	};

	const css = (el, styles = {}) => {
		if( !el ) return;

		for(let [ prop, value ] of Object.entries(styles))
			el.style.setProperty(prop, value);
	};

	const shuffle = (arr) => {
		let array = [ ...arr ];

		for(let i = array.length - 1; i > 0; i--){
			let j = Math.floor(Math.random() * (i + 1));
			[ array[i], array[j] ] = [ array[j], array[i] ];
		}

		return array;
	};

	const createShuffleCycle = (array) => {
		let shuffled = [];
		let index = 0;

		return () => {
			if( shuffled[index] )
				return shuffled[index++];

			index = 1;
			shuffled = shuffle(array);
			return shuffled[0];
		};
	};

	return {
		el,
		find,
		findAll,
		on,
		off,
		css,
		shuffle,
		createShuffleCycle,
	};
})();

const defaultSettings = {
	memeChannels: [],
	muted: false,
	volume: 0.5,
	chaosMode: false,
	cooldownMode: false,

	limiter: 0.7,
	cooldown: [ 10, 1000 ],
	settingsSounds: true,
	useThemeColors: false,
	history: true,
	historyLimit: 100,
	soundsLimit: 100,
};

const memeIcons = [
	'https://img.icons8.com/fluency/96/null/doge.png',
	'https://img.icons8.com/color/96/null/not-bad-meme.png',
	'https://img.icons8.com/officel/80/null/scared-face-meme.png',
	'https://img.icons8.com/fluency/96/null/trollface.png',
	'https://img.icons8.com/color/96/null/feels-guy.png',
	'https://img.icons8.com/fluency/96/null/lul.png',
	'https://img.icons8.com/fluency/96/null/monkas.png',
	'https://img.icons8.com/fluency/96/null/pogchamp.png',
	'https://img.icons8.com/fluency/96/null/gachi.png',
	'https://img.icons8.com/fluency/96/null/angry-face-meme.png',
	'https://img.icons8.com/color-glass/96/null/salt-bae.png',
	'https://img.icons8.com/color/96/null/ugandan-knuckles.png',
];

const isRU = (/ru/).test(navigator.language);

module.exports = class Memessages
{

	constructor(meta)
	{
		this.meta = meta;
		this.init();
	}

	init()
	{
		this.pluginEnabled = false;

		this.lastMessageID = null;
		this.audioQueue = new Set();
		this.cooldowns = new Set();
		this.sidebar = false;
		this.sidebarPinned = false;
		this.settingsSubMenu = false;
		this.refs = {};

		this._settings = null;

		this.destroy = () => {};

		this.getMemeIcon = $.createShuffleCycle(
			memeIcons
				.map(url => {
					new Image(url);
					return url;
				})
		);
	}

	get memeIcon()
	{
		return this.getMemeIcon();
	}

	get settings()
	{
		if( this._settings )
			return this._settings;

		return this._settings = Object.assign({}, defaultSettings, (
			BdApi.Data.load(this.meta.name, 'settings') ?? {}
		));
	}

	set settings(value)
	{
		this._settings = value;
		BdApi.Data.save(this.meta.name, 'settings', value);
	}

	mount(el, selector, method = 'append', firstMount = true)
	{
		if( !el ) return;

		const parent = $.find(selector);

		if( !parent ){
			if( !firstMount )
				$.on(document, 'click', () => {
					setTimeout(() => this.mount(el, selector, method, false), 100);
				}, { capture: true, once: true });

			return;
		}

		parent?.[method]?.(el);

		BdApi.DOM.onRemoved(el, () => {
			if( this.pluginEnabled )
				this.mount(el, selector, method, false);
		});

		if( firstMount )
			this.onDestroy(() => el.remove());
	}

	onDestroy(after)
	{
		const before = this.destroy;
		this.destroy = () => {
			before();
			after();
		};
	}

	fetch(options)
	{
		return new Promise(resolve => {
			require('request')(options, (error, response, data) => {
				if( error || response.statusCode != 200 ){
					BdApi.UI.showToast(`${ isRU ? 'Ошибка' : 'Error' }: ${ error.message || response.statusCode }`, {
						type: 'danger',
						timeout: 3000,
					});

					throw new Error(error || response.statusCode);
				}

				resolve(data);
			});
		});
	}

	async onMessage({ message, optimistic })
	{
		if(
			!this.pluginEnabled
			||
			optimistic
			||
			this.lastMessageID == message.id
			||
			!message.content
			||
			(
				!this.settings.chaosMode
				&&
				!this.settings.memeChannels.includes(message.channel_id)
			)
		)	return;

		this.lastMessageID = message.id;

		const modificators = this.getModificators(message.content);
		const meta = await this.getMemeSoundMeta(message.content, modificators);

		if( meta ){
			const url = `https://api.meowpad.me/v2/sounds/preview/${ meta.id }.m4a`;
			
			this.createAudio(url, meta, message, modificators, true, (
				!this.settings.cooldownMode
				||
				!this.cooldowns.has(message.author.id)
			));

			const user = Discord.userStore.getCurrentUser();

			if(
				this.settings.cooldownMode
				&&
				!this.cooldowns.has(message.author.id)
				&&
				user.id != message.author.id
			){
				this.cooldowns.add(message.author.id);

				const [ s, ms ] = this.settings.cooldown;

				setTimeout(() => {
					const [ _s, _ms ] = this.settings.cooldown;

					if( this.pluginEnabled && this.settings.cooldownMode && s === _s && ms === _ms )
						this.cooldowns.delete(message.author.id);
				}, s * ms);
			}
		}
	}

	onMessageDelete({ id })
	{
		if( !this.pluginEnabled ) return;

		this.aggregateAudio(audio => {
			if( audio?.memessage?.id === id )
				this.stopAudio(audio);
		});
	}

	onMessageEdit({ message })
	{
		if( !this.pluginEnabled || !message || !message.content ) return;
		
		this.onMessageDelete(message);

		this.lastMessageID = null;

		this.onMessage({ message });
	}

	getModificators(text)
	{
		let modificators = {
			gain: 1,
			bass: 0,
			rate: 1,
			pitch: false,
			echo: false,
			soundIndex: 0,
			important: false,
			lang: null,
		};

		const rules = [
			[
				/^(\d+)%$/,
				(match, $1) => modificators.gain = Number($1) / 100,
			],
			[
				/^bb(\d+)$/,
				(match, $1) => modificators.bass = Number($1) * 10,
			],
			[
				/^>>(\d+)$/,
				(match, $1) => modificators.rate = Number($1) / 100,
			],
			[
				/^#$/,
				() => modificators.pitch = true,
			],
			[
				/^echo$/,
				() => modificators.echo = true,
			],
			[
				/^(\d+)$/,
				(match, $1) => modificators.soundIndex = Number($1),
			],
			[
				/^!$/,
				() => modificators.important = true,
			],
			[
				/^(ru|en)$/,
				(match, $1) => modificators.lang = $1,
			],

			// dev
			[
				/^log$/,
				() => console.log(this),
			],
		];

		for(let [ match, $1 ] of text.matchAll(/\[([^\]]+)\]/gm)){
			for(let [ reg, apply ] of rules){
				const result = $1.match(reg);

				if( result )
					apply(...result);
			}
		}

		return modificators;
	}

	async getMemeSoundMeta(text, modificators = {})
	{
		text = text
			.replace(/\[([^\]]+)\]/gm, '')
			.replace(
				/(https?:\/\/tenor\.com\/view\/)([^\s]+)/gim,
				(match, $1, $2) => decodeURIComponent(
					$2
						.replace(/(-gif-|-)/gim, ' ')
						.replace(/\d+$/gim, '')
						.trim()
				)
			)
			.replace(/\s+\s/gm, ' ')
			.trim();

		if( !text )
			return null;

		const lang = modificators.lang ?? (
			text.match(/[а-яё]/i)
				? 'ru'
				: 'en'
		);

		const languages = ['en', 'ru']
			.sort(l => l == lang ? -1 : 0);

		let offset = modificators.soundIndex ?? 0;

		for(let language of languages){
			const getPage = async (page = 1) => {
				const json = await this.fetch({
					url: `https://api.meowpad.me/v2/sounds/search?q=${ encodeURIComponent(text) }&page=${ page }`,
					headers: { 'accept-language': language },
				});
	
				return JSON.parse(json);
			};
	
			let page = await getPage();
	
			if( !page.sounds.length )
				continue;
	
			let pageIndex = Math.floor(offset / page.sounds.length);
			let soundIndex = offset % page.sounds.length;
	
			if( pageIndex > 0 )
				page = await getPage(pageIndex + 1);

			let soundMeta = page.sounds?.[soundIndex];

			if( soundMeta )
				return soundMeta;

			offset -= page.meta.totalResults;
		}

		return null;
	}

	async createAudio(url, meta = null, message = null, modificators = {}, addToHistory = true, autoplay = true)
	{
		const audio = new Audio();

		const ctx = new AudioContext();
		const source = ctx.createMediaElementSource(audio);

		const echoInput = ctx.createGain();
		const echoDelay = ctx.createDelay();
		const echoFeedback = ctx.createGain();
		const echoWetLevel = ctx.createGain();
		const echoOutput = ctx.createGain();
		const bass = ctx.createBiquadFilter();
		const gain = ctx.createGain();
		const compressor = ctx.createDynamicsCompressor();

		echoInput.connect(echoDelay);
		echoDelay.connect(echoFeedback).connect(echoDelay);
		echoDelay.connect(echoWetLevel).connect(echoOutput);

		source
			.connect(echoInput)
			.connect(echoOutput)
			.connect(bass)
			.connect(gain)
			.connect(compressor)
			.connect(ctx.destination);

		echoDelay.delayTime.value = modificators.echo ? 0.2 : 0;
		echoFeedback.gain.value = modificators.echo ? 0.3 : 0;
		echoWetLevel.gain.value = modificators.echo ? 0.3 : 0;

		bass.type = 'lowshelf';
		bass.frequency.value = 200;
		bass.gain.value = modificators.bass ?? 0;

		gain.gain.value = modificators.gain ?? 1;

		compressor.threshold.value = (this.settings.limiter - 1) * 100;
		compressor.ratio.value = 20;
		compressor.attack.value = 0;

		audio.memeURL = url;
		audio.memessage = message;
		audio.ui = {};
		audio.effects = {
			echo: {
				delay: echoDelay,
				feedback: echoFeedback,
				wetLevel: echoWetLevel,
			},
			bass,
			gain,
			compressor,
		};

		audio.playbackRate = modificators.rate ?? 1;
		audio.preservesPitch = !(modificators.pitch ?? false);

		$.on(audio, 'ended', () => {
			this.stopAudio(audio);
		});

		if( addToHistory && this.settings.history && message ){
			let card = $.el('div', { class: 'memessages--card' });
			let wrapper = $.el('div');
			let authorWrapper = $.el('div');
			let msgAuthor = $.el('span', { class: 'memessages--username', ['data-memessages-tooltip']: true });
			let msgText = $.el('span', { ['data-memessages-tooltip']: true });

			$.css(msgAuthor, {
				'--text': `'${ isRU ? 'Перейти к сообщению' : 'Go to message' }'`,
				'--ws': 'nowrap',
			});

			$.css(msgText, {
				'--text': `'${ isRU ? 'Копировать' : 'Copy' }'`,
				'--ws': 'nowrap',
				'cursor': 'pointer',
			});

			msgAuthor.innerText = '@' + message?.author?.username;
			msgText.innerText = message?.content;

			$.on(msgAuthor, 'click', () => {
				Discord.navigateTo(`/channels/${ message?.guild_id ?? '@me' }/${ message?.channel_id }/${ message?.id }`);
			});

			$.on(msgText, 'click', () => {
				DiscordNative.clipboard.copy(msgText.innerText);
				BdApi.UI.showToast(isRU ? 'Скопировано' : 'Copied', {
					type: 'info',
					timeout: 1000,
				});
			});

			authorWrapper.append(msgAuthor);
			wrapper.append(authorWrapper);
			wrapper.append(msgText);
			card.append(wrapper);

			const player = $.el('div', { class: 'memessages--player' });
			const playBtn = $.el('i', { class: 'fa-solid fa-play' });
			const progressBar = $.el('div', { class: 'memessages--slider progress' });
			const meowpadBtn = $.el('a', { href: `https://meowpad.me/sound/${ meta?.id ?? 0 }`, target: '_blank', ['data-memessages-tooltip']: true });
			const mewopadIcon = $.el('i', { class: 'fa-solid fa-arrow-up-right-from-square' });
			const downloadBtn = $.el('a', { href: audio.src, target: '_blank', download: `${ meta?.slug ?? 'audio' }.m4a`, ['data-memessages-tooltip']: true });
			const downloadIcon = $.el('i', { class: 'fa-solid fa-download' });

			$.css(progressBar, {
				'pointer-events': 'none',
			});

			$.css(meowpadBtn, {
				'--text': `'Meowpad'`,
				'--offset': 'calc(-50% + 9px)',
				'--ws': 'nowrap',
			});

			$.css(downloadBtn, {
				'--text': `'${ isRU ? 'Загрузить' : 'Download' }'`,
				'--offset': 'calc(-100% + 18px)',
				'--ws': 'nowrap',
			});
			
			meowpadBtn.append(mewopadIcon);
			downloadBtn.append(downloadIcon);
			player.append(playBtn);
			player.append(progressBar);
			if( meta ) player.append(meowpadBtn);
			player.append(downloadBtn);
			card.append(player);

			$.on(playBtn, 'click', () => {
				if( this.audioQueue.has(audio) )
					this.stopAudio(audio);
				else
					this.playAudio(audio);
			});

			let enabled = false;
			const onChange = e => {
				if( !enabled ) return;

				requestAnimationFrame(async () => {
					const bounds = progressBar.getBoundingClientRect();

					let value = Math.max(0, (
						Math.min(1, (
							(e.clientX - bounds.x) / bounds.width
						))
					));

					audio.currentTime = Math.round(value * audio.duration);
				});
			};

			$.on(progressBar, 'mousedown', e => {
				enabled = true;
				onChange(e);
			});

			$.on(document, 'mousemove', onChange);

			$.on(document, 'mouseup', e => {
				enabled = false;
			});

			$.on(audio, 'timeupdate', () => {
				$.css(progressBar, {
					'--value': audio.currentTime / audio.duration || 0,
				});
			});

			this.refs.history.prepend(card);
			this.cutHistory();

			audio.ui = {
				card,
				playBtn,
				progressBar,
			};
		}

		if( autoplay ){
			if( modificators.important )
				this.aggregateAudio(audio => {
					if( audio?.memessage?.channel_id == message?.channel_id )
						this.stopAudio(audio);
				});

			await this.playAudio(audio);
		}

		return audio;
	}

	async loadAudio(audio)
	{
		audio?.ui?.playBtn?.classList?.remove?.('fa-play');
		audio?.ui?.playBtn?.classList?.add?.('fa-circle-notch');
		audio?.ui?.playBtn?.classList?.add?.('fa-spin');

		await new Promise(async resolve => {
			$.on(audio, 'canplaythrough', resolve, { once: true });

			let url = audio.memeURL;

			if( !url.startsWith('blob:') ){
				const bin = await this.fetch({ url, headers: { 'Content-Type': 'audio/m4a' } });
				const blob = new Blob([ bin.buffer ], { type: 'audio/m4a' });
				url = URL.createObjectURL(blob);
			}

			if( audio.src != url ){
				audio.src = url;
			}else{
				$.off(audio, 'canplaythrough');
				resolve();
			}
		});

		audio?.ui?.playBtn?.classList?.add?.('fa-play');
		audio?.ui?.playBtn?.classList?.remove?.('fa-circle-notch');
		audio?.ui?.playBtn?.classList?.remove?.('fa-spin');

		$.css(audio?.ui?.progressBar, {
			'pointer-events': '',
		});
	}

	async playAudio(audio)
	{
		if( this.audioQueue.has(audio) ) return;

		if( this.audioQueue.size >= this.settings.soundsLimit )
			return BdApi.UI.showToast(isRU ? 'Слишком много звуков!!!' : 'Too many sounds!!!', {
				type: 'danger',
				timeout: 3000,
			});

		this.audioQueue.add(audio);

		if( !audio.src || audio.readyState === 0 )
			await this.loadAudio(audio);

		if( !this.pluginEnabled || !this.audioQueue.has(audio) ) return;

		audio.muted = this.settings.muted;
		audio.volume = this.settings.volume;
		audio.effects.compressor.threshold.value = (this.settings.limiter - 1) * 100;

		audio?.ui?.playBtn?.classList?.remove?.('fa-play');
		audio?.ui?.playBtn?.classList?.add?.('fa-circle-notch');
		audio?.ui?.playBtn?.classList?.add?.('fa-spin');

		$.css(audio?.ui?.playBtn, {
			'pointer-events': 'none',
		});

		await new Promise(resolve => {
			(function play(){
				audio.play()
					.then(() => {
						if( audio.paused )
							play();
						else
							resolve();
					})
					.catch(play);
			})()
		});

		audio?.ui?.playBtn?.classList?.add?.('fa-stop');
		audio?.ui?.playBtn?.classList?.remove?.('fa-circle-notch');
		audio?.ui?.playBtn?.classList?.remove?.('fa-spin');

		$.css(audio?.ui?.playBtn, {
			'pointer-events': '',
		});
	}

	stopAudio(audio)
	{
		this.audioQueue.delete(audio);

		audio.pause();
		audio.currentTime = 0;

		audio?.ui?.playBtn?.classList?.add?.('fa-play');
		audio?.ui?.playBtn?.classList?.remove?.('fa-stop');
		audio?.ui?.playBtn?.classList?.remove?.('fa-circle-notch');
		audio?.ui?.playBtn?.classList?.remove?.('fa-spin');

		$.css(audio?.ui?.progressBar, { '--value': 0 });
	}

	async aggregateAudio(func)
	{
		for(let audio of this.audioQueue)
			await func(audio);
	}

	cutHistory()
	{
		$.findAll(`.memessages--card:nth-child(${ this.settings.historyLimit }) ~ .memessages--card`, this.refs.history)
			.forEach(overLimit => overLimit.remove());
	}

	async render()
	{
		if( this.settings.useThemeColors )
			$.find('#app-mount')
				.classList
				.add('memessages--use-theme-colors');



		const muteBtnLabelMute = isRU ? 'Отключить звук' : 'Mute';
		const muteBtnLabelUnmute = isRU ? 'Включить звук' : 'Unmute';
		const muteBtn = $.el('div', {
			class: `${ $.find('[class^="winButtonMinMax"]').classList.value } memessages--mute-toggle on`,
			['data-memessages-tooltip']: true,
		});

		$.css(muteBtn, {
			'--text': `'${ muteBtnLabelMute }'`,
			'--offset': 'calc(-100% + 28px)',
			'--ws': 'nowrap',
		});

		const muteBtnIcon = $.el('i', { class: 'fa-solid fa-volume-off' });
		muteBtn.append(muteBtnIcon);

		const muteBtnImg = $.el('img', { src: this.memeIcon });
		muteBtn.append(muteBtnImg);

		if( this.settings.muted ){
			muteBtn.classList.remove('on');
			$.css(muteBtn, { '--text': `'${ muteBtnLabelUnmute }'` });
		}

		$.on(muteBtn, 'click', () => {
			this.settings = {
				...this.settings,
				muted: !this.settings.muted,
			};

			muteBtn.classList.toggle('on');

			this.aggregateAudio(audio => audio.muted = this.settings.muted);

			$.css(muteBtn, { '--text': `'${ muteBtnLabelUnmute }'` });

			if( !this.settings.muted ){
				muteBtnImg.setAttribute('src', this.memeIcon);
				$.css(muteBtn, { '--text': `'${ muteBtnLabelMute }'` });
			}
		});

		this.mount(muteBtn, '[class^="typeWindows"][class*="titleBar"]');



		const channelBtnLabelOn = isRU ? 'Включить мемы в канале' : 'Enable memes in a channel';
		const channelBtnLabelOff = isRU ? 'Выключить мемы в канале' : 'Disable memes in a channel';
		const channelBtn = $.el('div', {
			class: 'memessages--toolbar-btn memessages--channel-btn',
			['data-memessages-tooltip']: true,
		});

		$.css(channelBtn, {
			'--text': `'${ channelBtnLabelOn }'`,
			'--offset': 'calc(-100% + 30px)',
			'--ws': 'nowrap',
		});

		const channelBtnIconOn = $.el('i', { class: 'memessages--channel-btn--icon-on fa-solid fa-bell' });
		channelBtn.append(channelBtnIconOn);

		const channelBtnIconOff = $.el('i', { class: 'memessages--channel-btn--icon-off fa-solid fa-bell-slash' });
		channelBtn.append(channelBtnIconOff);

		const channelBtnImg = $.el('img', { src: this.memeIcon });
		channelBtn.append(channelBtnImg);

		const currentChannelId = Discord.channelStore.getChannelId();

		if( !currentChannelId )
			channelBtn.classList.add('hide');

		if( this.settings.memeChannels.includes(currentChannelId) ){
			channelBtn.classList.add('on');
			$.css(channelBtn, { '--text': `'${ channelBtnLabelOff }'` });
		}

		$.on(channelBtn, 'click', () => {
			channelBtn.classList.toggle('on');

			const channelId = Discord.channelStore.getChannelId();

			if( this.settings.memeChannels.includes(channelId) ){
				this.settings = {
					...this.settings,
					memeChannels: this.settings.memeChannels
						.filter(id => id != channelId),
				};

				$.css(channelBtn, { '--text': `'${ channelBtnLabelOn }'` });

				this.aggregateAudio(audio => {
					if( audio?.memessage?.channel_id == channelId )
						this.stopAudio(audio);
				});
			}else{
				this.settings = {
					...this.settings,
					memeChannels: [
						...this.settings.memeChannels,
						channelId,
					]
				};

				channelBtnImg.setAttribute('src', this.memeIcon);
				$.css(channelBtn, { '--text': `'${ channelBtnLabelOff }'` });
			}
		});

		const onChannelChange = ({ channelId }) => {
			if( !this.pluginEnabled ) return;

			if( channelId ){
				channelBtn.classList.remove('hide');

				if( this.settings.memeChannels.includes(channelId) ){
					channelBtn.classList.add('on');
					$.css(channelBtn, { '--text': `'${ channelBtnLabelOff }'` });
				}else{
					channelBtn.classList.remove('on');
					$.css(channelBtn, { '--text': `'${ channelBtnLabelOn }'` });
				}
			}
			else
				channelBtn.classList.add('hide');
		};

		Discord.dispatcher.subscribe('CHANNEL_SELECT', onChannelChange);
		this.onDestroy(() => {
			Discord.dispatcher.unsubscribe('CHANNEL_SELECT', onChannelChange);
		});

		this.mount(channelBtn, '[class^="toolbar"]');



		const sidebarBtn = $.el('div', {
			class: 'memessages--toolbar-btn',
		});

		const sidebarBtnIcon = $.el('i', { class: 'fa-solid fa-bars' });
		sidebarBtn.append(sidebarBtnIcon);

		const sidebarBtnImg = $.el('img', { src: this.memeIcon });
		sidebarBtn.append(sidebarBtnImg);

		$.on(sidebarBtn, 'click', () => {
			this.sidebar = !this.sidebar;
			
			if( this.sidebar ){
				sidebar.classList.add('open');
			}else{
				sidebar.classList.remove('open');
			}

			sidebarBtnImg.setAttribute('src', this.memeIcon);
		});

		this.mount(sidebarBtn, '[class^="toolbar"]');



		const sidebarUnpinBtn = $.el('div', {
			class: 'memessages--toolbar-btn hide',
			['data-memessages-tooltip']: true,
		});

		$.css(sidebarUnpinBtn, {
			'--text': `'${ isRU ? 'Открепить' : 'Unpin' }'`,
			'--offset': 'calc(-100% + 30px)',
		});

		const sidebarUnpinBtnIcon = $.el('i', { class: 'fa-solid fa-thumbtack' });
		sidebarUnpinBtn.append(sidebarUnpinBtnIcon);

		const sidebarUnpinBtnImg = $.el('img', { src: this.memeIcon });
		sidebarUnpinBtn.append(sidebarUnpinBtnImg);

		$.on(sidebarUnpinBtn, 'click', () => {
			this.sidebarPinned = !this.sidebarPinned;
			
			if( this.sidebarPinned ){
				sidebar.classList.add('pin');
				sidebarBtn.classList.add('hide');
				sidebarUnpinBtn.classList.remove('hide');

				$.css(
					$.find('[class^="base"]'),
					{ 'border-top-right-radius': '8px' },
				);
			}else{
				sidebar.classList.remove('pin');
				sidebarBtn.classList.remove('hide');
				sidebarUnpinBtn.classList.add('hide');

				$.css(
					$.find('[class^="base"]'),
					{ 'border-top-right-radius': '' },
				);
			}

			sidebarUnpinBtnImg.setAttribute('src', this.memeIcon);
		});

		this.onDestroy(() => {
			$.css(
				$.find('[class^="base"]'),
				{ 'border-top-right-radius': '' },
			);
		});

		this.mount(sidebarUnpinBtn, '[class^="toolbar"]');



		const sidebar = $.el('div', { class: 'memessages--sidebar' });

		const sidebarMainScrollbox = $.el('div', { class: 'memessages--sidebar--scrollbox' });
		const sidebarQuickSettings = $.el('div', { class: 'memessages--card sticky' });

		const sidebarSettingsScrollbox = $.el('div', { class: 'memessages--sidebar--scrollbox hide' });
		const sidebarPluginSettings = $.el('div', { class: 'memessages--card' });

		const sidebarCloseBtn = $.el('i', { class: 'memessages--sidebar--close memessages--sidebar--floating-btn fa-solid fa-angle-right' });
		const sidebarPinBtn = $.el('i', { class: 'memessages--sidebar--pin memessages--sidebar--floating-btn fa-solid fa-thumbtack' });
		const history = $.el('div', { class: 'memessages--sidebar--history' });

		this.refs.history = history;

		sidebarMainScrollbox.append(sidebarQuickSettings);
		sidebarMainScrollbox.append(history);
		sidebarSettingsScrollbox.append(sidebarPluginSettings);
		sidebar.append(sidebarMainScrollbox);
		sidebar.append(sidebarSettingsScrollbox);
		sidebar.append(sidebarCloseBtn);
		sidebar.append(sidebarPinBtn);

		$.on(sidebarCloseBtn, 'click', () => {
			this.sidebar = false;
			sidebar.classList.remove('open');
			sidebarMainScrollbox.classList.remove('blur');
			sidebarSettingsScrollbox.classList.add('hide');
		});

		$.on(sidebarPinBtn, 'click', () => {
			this.sidebarPinned = true;

			sidebar.classList.add('pin');
			sidebarBtn.classList.add('hide');
			sidebarUnpinBtn.classList.remove('hide');

			$.css(
				$.find('[class^="base"]'),
				{ 'border-top-right-radius': '8px' },
			);
		});

		$.on(sidebarMainScrollbox, 'scroll', () => {
			if( sidebarMainScrollbox.scrollTop > 30 )
				sidebarQuickSettings.classList.add('stuck');
			else
				sidebarQuickSettings.classList.remove('stuck');
		});

		let settingsRefs = {};

		const quickSettingsList = [
			{
				type: 'slider',
				sounds: [
					'https://api.meowpad.me/v2/sounds/preview/57562.m4a',
					'https://api.meowpad.me/v2/sounds/preview/37525.m4a',
					'https://api.meowpad.me/v2/sounds/preview/60843.m4a',
					'https://api.meowpad.me/v2/sounds/preview/39479.m4a',
					'https://api.meowpad.me/v2/sounds/preview/1475.m4a',
					'https://api.meowpad.me/v2/sounds/preview/3145.m4a',
					'https://api.meowpad.me/v2/sounds/preview/1125.m4a',
					'https://api.meowpad.me/v2/sounds/preview/29.m4a',
					'https://api.meowpad.me/v2/sounds/preview/46609.m4a',
					'https://api.meowpad.me/v2/sounds/preview/1826.m4a',
					'https://api.meowpad.me/v2/sounds/preview/39096.m4a',
					'https://api.meowpad.me/v2/sounds/preview/10190.m4a',
					'https://api.meowpad.me/v2/sounds/preview/54023.m4a',
					'https://api.meowpad.me/v2/sounds/preview/55193.m4a',
					'https://api.meowpad.me/v2/sounds/preview/41776.m4a',
					'https://www.myinstants.com/media/sounds/devil-may-cry-menu-sound.mp3',
					'https://www.myinstants.com/media/sounds/eh-put0-marty-mcfly.mp3',
				],
				prop: 'volume',
				title: isRU ? 'Громкость' : 'Volume',
				icon: 'fa-solid fa-volume-high',
				action: value => {
					this.aggregateAudio(audio => audio.volume = value);
				},
			},
			{
				type: 'toggle',
				sounds: [
					'https://api.meowpad.me/v2/sounds/preview/78899.m4a',
					'https://api.meowpad.me/v2/sounds/preview/78898.m4a',
					'https://api.meowpad.me/v2/sounds/preview/963.m4a',
					'https://api.meowpad.me/v2/sounds/preview/7486.m4a',
					'https://api.meowpad.me/v2/sounds/preview/25300.m4a',
					'https://api.meowpad.me/v2/sounds/preview/74341.m4a',
					'https://api.meowpad.me/v2/sounds/preview/641.m4a',
					'https://api.meowpad.me/v2/sounds/preview/62105.m4a',
					'https://api.meowpad.me/v2/sounds/preview/974.m4a',
					'https://api.meowpad.me/v2/sounds/preview/1216.m4a',
					'https://api.meowpad.me/v2/sounds/preview/48886.m4a',
					'https://www.myinstants.com/media/sounds/00002a5b.mp3',
				],
				prop: 'chaosMode',
				title: isRU ? 'Режим Хаоса!' : 'Chaos Mode!',
				desc: isRU ? 'Включает звуки во всех каналах' : 'Turns on sounds for all channels',
				icon: 'fa-solid fa-skull',
			},
			{
				type: 'toggle',
				sounds: [
					...(
						isRU
							? [
								'https://api.meowpad.me/v2/sounds/preview/35004.m4a',
								'https://api.meowpad.me/v2/sounds/preview/3944.m4a',
							]
							: []
					),
					'https://api.meowpad.me/v2/sounds/preview/10541.m4a',
					'https://api.meowpad.me/v2/sounds/preview/498.m4a',
				],
				prop: 'cooldownMode',
				title: isRU ? 'Режим Кулдауна' : 'Cooldown Mode',
				desc: isRU ? 'Пользователи не смогут спамить' : 'Users will not be able to spam',
				icon: 'fa-solid fa-stopwatch',
				action: () => {
					this.cooldowns.clear();
				},
			},
			// favorite,
			{
				type: 'button',
				sounds: [
					'https://api.meowpad.me/v2/sounds/preview/80931.m4a',
				],
				title: isRU ? 'Настройки' : 'Settings',
				icon: 'fa-solid fa-gear',
				action: () => {
					this.settingsSubMenu = true;

					sidebarMainScrollbox.classList.add('blur');
					sidebarSettingsScrollbox.classList.remove('hide');
				},
			},
			{
				type: 'button',
				sounds: [
					'https://api.meowpad.me/v2/sounds/preview/38297.m4a',
				],
				title: isRU ? 'О плагине' : 'About',
				icon: 'fa-solid fa-info',
				action: () => {
					const h = React.createElement;
					BdApi.UI.showConfirmationModal(`${ this.meta.name } ${ this.meta.version }`, (
						isRU
							? h('div', { class: 'memessages--discord-modal-content' },
								h('p', null, 'Спасибо за установку плагина =)'),
								h('p', null,
									h('span', null, 'Если вам понравился плагин, вы можете поддержать меня тут: '),
									h('a', { href: 'https://boosty.to/greezor', target: '_blank' }, 'Boosty'),
								),
								h('br'),
								h('p', null,
									h('sub', null,
										h('span', null, 'Звуки: '),
										h('a', { href: 'https://meowpad.me/', target: '_blank' }, 'Meowpad'),
									),
									h('br'),
									h('sub', null,
										h('span', null, 'Иконки: '),
										h('a', { href: 'https://fontawesome.com/', target: '_blank' }, 'Font Awesome'),
										h('span', null, ', '),
										h('a', { href: 'https://icons8.com/', target: '_blank' }, 'Icons8'),
									),
								),
							)
							: h('div', { class: 'memessages--discord-modal-content' },
								h('p', null, 'Thank you for installing the plugin =)'),
								h('p', null,
									h('span', null, 'If you like the plugin, you can support me here: '),
									h('a', { href: 'https://boosty.to/greezor', target: '_blank' }, 'Boosty'),
								),
								h('br'),
								h('p', null,
									h('sub', null,
										h('span', null, 'Sounds: '),
										h('a', { href: 'https://meowpad.me/', target: '_blank' }, 'Meowpad'),
									),
									h('br'),
									h('sub', null,
										h('span', null, 'Icons: '),
										h('a', { href: 'https://fontawesome.com/', target: '_blank' }, 'Font Awesome'),
										h('span', null, ', '),
										h('a', { href: 'https://icons8.com/', target: '_blank' }, 'Icons8'),
									),
								),
							)
					), {
						confirmText: 'OK',
						cancelText: null,
					});
				},
			},
		];

		const pluginSettingsList = [
			{
				type: 'button',
				sounds: [
					'https://api.meowpad.me/v2/sounds/preview/80930.m4a',
				],
				title: isRU ? 'Назад' : 'Back',
				icon: 'fa-solid fa-arrow-left',
				action: () => {
					this.settingsSubMenu = false;

					sidebarMainScrollbox.classList.remove('blur');
					sidebarSettingsScrollbox.classList.add('hide');
				},
			},
			{ type: 'delimiter' },
			// friends sounds,
			// whitelist,
			// blacklist,
			// hotkeys,
			{
				type: 'slider',
				prop: 'limiter',
				title: isRU ? 'Лимитер' : 'Limiter',
				desc: isRU ? 'Защита слуха' : 'Ear protection',
				icon: 'fa-solid fa-shield-halved',
				action: value => {
					const db = (value - 1) * 100;
					this.aggregateAudio(audio => audio.effects.compressor.threshold.value = db);
					settingsRefs.limiterValue.innerText = `${ Math.round(db) }db`;
				},
				render: el => {
					const limiterValue = $.el('div', { class: 'memessages--pill' });
					limiterValue.innerText = `${ Math.round((this.settings.limiter - 1) * 100) }db`;
					el.append(limiterValue);

					settingsRefs.limiterValue = limiterValue;
				},
			},
			{
				type: 'inputGroup',
				sounds: [
					'https://api.meowpad.me/v2/sounds/preview/79117.m4a',
				],
				prop: 'cooldown',
				title: isRU ? 'Кулдаун' : 'Cooldown',
				desc: isRU ? 'Длительность' : 'Duration',
				icon: 'fa-solid fa-stopwatch-20',
				options: [
					{
						min: '1',
						type: 'number',
						style: 'width: 30px; text-align: right;',
					},
					{ type: 'hidden' },
				],
				action: value => {
					this.cooldowns.clear();

					this.settings = {
						...this.settings,
						cooldown: [
							Math.max(1, Number(value[0])),
							Number(value[1]),
						],
					};
				},
				render: el => {
					const select = $.el('select', { class: 'memessages--input', style: 'width: 50px' }, [
						[ 'option', { value: 1000, style: 'color:black' }, isRU ? 'сек' : 'sec' ],
						[ 'option', { value: 1000 * 60, style: 'color:black' }, isRU ? 'мин' : 'min' ],
						[ 'option', { value: 1000 * 60 * 60, style: 'color:black' }, isRU ? 'час' : 'hrs' ],
					]);

					select.value = this.settings.cooldown[1];
					
					const hidden = $.find('[type="hidden"]', el);
					hidden.after(select);
					hidden.remove();

					$.on(select, 'input', () => {
						this.settings = {
							...this.settings,
							cooldown: [
								this.settings.cooldown[0],
								parseInt(select.value),
							],
						};
					});
				},
			},
			{
				type: 'toggle',
				sounds: [
					'https://api.meowpad.me/v2/sounds/preview/656.m4a',
				],
				prop: 'settingsSounds',
				title: isRU ? 'Звуки в настройках' : 'Sounds in settings',
				icon: 'fa-solid fa-gears',
			},
			{
				type: 'toggle',
				sounds: [
					'https://api.meowpad.me/v2/sounds/preview/37043.m4a',
				],
				prop: 'useThemeColors',
				title: isRU ? 'Использовать цвета темы' : 'Use theme colors',
				icon: 'fa-solid fa-palette',
				action: value => {
					if( value )
						$.find('#app-mount')
							.classList
							.add('memessages--use-theme-colors');
					else
						$.find('#app-mount')
							.classList
							.remove('memessages--use-theme-colors');
				},
			},
			{
				type: 'toggle',
				sounds: [
					...(
						isRU
							? [
								'https://api.meowpad.me/v2/sounds/preview/31297.m4a',
								'https://api.meowpad.me/v2/sounds/preview/4898.m4a',
								'https://api.meowpad.me/v2/sounds/preview/8761.m4a',
							]
							: []
					),
					'https://api.meowpad.me/v2/sounds/preview/24702.m4a',
					'https://api.meowpad.me/v2/sounds/preview/3435.m4a',
					'https://api.meowpad.me/v2/sounds/preview/2472.m4a',
					'https://api.meowpad.me/v2/sounds/preview/1688.m4a',
					'https://www.myinstants.com/media/sounds/back-to-the-future-1.mp3',
				],
				prop: 'history',
				title: isRU ? 'История звуков' : 'Sound history',
				icon: 'fa-solid fa-clock-rotate-left',
				action: () => {
					history.innerHTML = '';
				},
			},
			{
				type: 'input',
				sounds: [
					'https://api.meowpad.me/v2/sounds/preview/79117.m4a',
				],
				prop: 'historyLimit',
				title: isRU ? 'Лимит истории' : 'History limit',
				desc: isRU ? 'Максимальная длина истории' : 'Maximum history length',
				icon: 'fa-solid fa-bars-staggered',
				options: {
					min: '1',
					type: 'number',
					style: 'width: 50px; text-align: center;',
				},
				action: value => {
					this.settings = {
						...this.settings,
						historyLimit: Math.max(1, Number(value)),
					};
					
					this.cutHistory();
				},
			},
			{
				type: 'input',
				sounds: [
					'https://api.meowpad.me/v2/sounds/preview/79117.m4a',
				],
				prop: 'soundsLimit',
				title: isRU ? 'Лимит звуков' : 'Sounds limit',
				desc: isRU ? 'Максимум параллельных звуков' : 'Maximum parallel sounds',
				icon: 'fa-solid fa-music',
				options: {
					min: '1',
					type: 'number',
					style: 'width: 50px; text-align: center;',
				},
				action: value => {
					this.settings = {
						...this.settings,
						soundsLimit: Math.max(1, Number(value)),
					};
				},
			},
			{
				type: 'button',
				title: isRU ? 'Сброс настроек' : 'Reset settings',
				icon: 'fa-solid fa-rotate-right',
				action: () => {
					const h = React.createElement;
					BdApi.UI.showConfirmationModal(isRU ? 'Сброс настроек' : 'Reset settings', h(
						'div',
						{ class: 'memessages--discord-modal-content' },
						isRU ? 'Вы уверены что хотите восстановить настройки по умолчанию?' : 'Are you sure you want to restore the default settings?'
					), {
						confirmText: isRU ? 'Да' : 'Yes',
						cancelText: isRU ? 'Нет' : 'No',
						onConfirm: () => {
							this.settings = { ...defaultSettings };
							
							this.stop();

							BdApi.UI.showToast(isRU ? 'Перезапустите Discord!' : 'Restart Discord!', {
								type: 'warning',
								timeout: 3000,
							});
						},
					});
				},
			},
		];

		for(let [ settingsPanel, settingsList ] of [ [sidebarQuickSettings, quickSettingsList], [sidebarPluginSettings, pluginSettingsList] ]){
			for(let setting of settingsList){
				const param = $.el('div', { class: 'memessages--card--setting' });
				const labelGroup = $.el('div', { class: 'memessages--card--setting--label' });
				const icon = $.el('i', { class: `fa-sm fa-fw ${ setting?.icon ?? '' }` });
				const label = $.el('div');
				const title = $.el('div', { class: 'memessages--card--setting--label--title' });
				const desc = $.el('div', { class: 'memessages--card--setting--label--desc' });
				const fill = $.el('div', { style: 'margin-right: -15px; flex: 1 1 auto' });

				title.innerText = setting?.title ?? '';
				desc.innerText = setting?.desc ?? '';

				label.append(title);

				if( setting?.desc )
					label.append(desc);

				if( setting?.icon )
					labelGroup.append(icon);

				labelGroup.append(label);
				param.append(labelGroup);
				param.append(fill);
				settingsPanel.append(param);

				const getRandomSound = $.createShuffleCycle(
					( setting?.sounds ?? [] )
						.map(async url => {
							let sound = await this.createAudio(url, null, null, {}, false, false);
							await this.loadAudio(sound);
							return sound;
						})
				);

				switch(setting.type){
					case 'toggle':
						const toggle = $.el('div', { class: 'memessages--toggle' });
						param.append(toggle);

						for(let [ attr, value ] of Object.entries(setting?.options ?? {}))
							toggle.setAttribute(attr, value);

						if( this.settings[setting.prop] )
							toggle.classList.add('on');

						$.on(toggle, 'click', async () => {
							toggle.classList.toggle('on');

							this.settings = {
								...this.settings,
								[setting.prop]: !this.settings[setting.prop],
							};

							setting?.action?.(this.settings[setting.prop]);

							if( this.settings[setting.prop] ){
								const sound = await getRandomSound();
								
								if( sound && this.settings.settingsSounds ){
									this.stopAudio(sound);
									this.playAudio(sound);
								}
							}
						});
						break;

					case 'slider':
						const slider = $.el('div', { class: 'memessages--slider' });
						param.append(slider);

						for(let [ attr, value ] of Object.entries(setting?.options ?? {}))
							slider.setAttribute(attr, value);

						let value = this.settings[setting.prop];
						$.css(slider, { '--value': value });

						let enabled = false;
						const onChange = e => {
							if( !enabled ) return;

							requestAnimationFrame(async () => {
								const bounds = slider.getBoundingClientRect();

								let newValue = Math.max(0, (
									Math.min(1, (
										(e.clientX - bounds.x) / bounds.width
									))
								));

								$.css(slider, { '--value': newValue });

								this.settings = {
									...this.settings,
									[setting.prop]: newValue,
								};

								setting?.action?.(this.settings[setting.prop]);
							});
						};

						$.on(slider, 'mousedown', e => {
							enabled = true;
							onChange(e);
						});

						$.on(document, 'mousemove', onChange);

						$.on(document, 'mouseup', async e => {
							if( !enabled ) return;
							
							enabled = false;

							if( this.settings[setting.prop] != value ){
								const sound = await getRandomSound();
								
								if( sound && this.settings.settingsSounds ){
									this.stopAudio(sound);
									this.playAudio(sound);
								}
							}

							value = this.settings[setting.prop];
						});
						break;
					
					case 'button':
						param.classList.add('clickable');
						$.on(param, 'click', async () => {
							setting?.action?.(this.settings[setting.prop]);

							const sound = await getRandomSound();

							if( sound && this.settings.settingsSounds ){
								this.stopAudio(sound);
								this.playAudio(sound);
							}
						});
						break;

					case 'input':
					case 'inputGroup':
						const isGroup = setting.type == 'inputGroup';

						const to = isGroup
							? $.el('div', { class: 'memessages--input' })
							: param;

						if( isGroup )
							param.append(to);

						const values = isGroup
							? this.settings[setting.prop]
							: [ this.settings[setting.prop] ];

						for(let [ i, val ] of values.entries()){
							const input = $.el('input', { class: 'memessages--input', type: 'text' });
							to.append(input);

							const attrs = setting?.options ?? {};
							for(let [ attr, value ] of Object.entries( Array.isArray(attrs) ? (attrs?.[i] ?? {}) : attrs ))
								input.setAttribute(attr, value);

							input.value = val;

							$.on(input, 'keypress', e => e.stopPropagation());
							$.on(input, 'keydown', e => e.stopPropagation());
							$.on(input, 'keyup', e => e.stopPropagation());

							$.on(input, 'input', async e => {
								e.stopPropagation();

								this.settings = {
									...this.settings,
									[setting.prop]: isGroup
										? (() => {
											this.settings[setting.prop][i] = input.value;
											return this.settings[setting.prop];
										})()
										: input.value,
								};

								setting?.action?.(this.settings[setting.prop]);

								input.value = isGroup
									? this.settings[setting.prop][i]
									: this.settings[setting.prop];

								const sound = await getRandomSound();
								
								if( sound && this.settings.settingsSounds ){
									this.stopAudio(sound);
									this.playAudio(sound);
								}
							});
						}
						break;

					case 'delimiter':
						labelGroup.remove();
						param.classList.add('delimiter');
						break;
				}

				setting?.render?.(param);
			}
		}

		this.onDestroy(() => {
			$.find('#app-mount')
				.classList
				.remove('memessages--use-theme-colors');
		});

		this.mount(sidebar, '[class^="container"]');
	}

	async start()
	{
		this.init();

		this.pluginEnabled = true;

		const onMsg = e => this.onMessage(e);
		const onMsgDelete = e => this.onMessageDelete(e);
		const onMsgEdit = e => this.onMessageEdit(e);

		Discord.dispatcher.subscribe('MESSAGE_CREATE', onMsg);
		Discord.dispatcher.subscribe('MESSAGE_DELETE', onMsgDelete);
		Discord.dispatcher.subscribe('MESSAGE_UPDATE', onMsgEdit);

		this.onDestroy(() => {
			Discord.dispatcher.unsubscribe('MESSAGE_CREATE', onMsg);
			Discord.dispatcher.unsubscribe('MESSAGE_DELETE', onMsgDelete);
			Discord.dispatcher.unsubscribe('MESSAGE_UPDATE', onMsgEdit);
		});

		// $.on(document, 'keydown', e => this.onKeydown(e));
		// $.on(document, 'keyup', e => this.onKeyup(e));

		BdApi.DOM.addStyle(this.meta.name, `
			@import url("https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.3.0/css/all.min.css");

			:root{
				--mm-color--black: #000000;
				--mm-color--white: #fafafa;
				--mm-color--dark-gray: #1e1f22;
				--mm-color--light-gray: #e3e5e8;
				--mm-color--gray: #313338;
				--mm-color--discord: #5865ed;
			}

			html.theme-dark{
				--mm--bg: var(--mm-color--gray);
				--mm--bg-second: var(--mm-color--dark-gray);
				--mm--bg-negative: var(--mm-color--white);
				--mm--accent: var(--mm-color--discord);
				--mm--text: var(--mm-color--white);
				--mm--text-negative: var(--mm-color--gray);
			}

			html.theme-light{
				--mm--bg: var(--mm-color--white);
				--mm--bg-second: var(--mm-color--light-gray);
				--mm--bg-negative: var(--mm-color--gray);
				--mm--accent: var(--mm-color--discord);
				--mm--text: var(--mm-color--gray);
				--mm--text-negative: var(--mm-color--white);
			}

			#app-mount.memessages--use-theme-colors{
				--mm-color--black: var(--black);
				--mm-color--white: var(--white);
				--mm-color--dark-gray: var(--primary-500);
				--mm-color--light-gray: var(--primary-300);
				--mm-color--gray: var(--primary-600);
				--mm-color--discord: var(--brand-experiment);

				--mm--bg: var(--bg-overlay-chat, var(--background-primary));
				--mm--bg-second: var(--background-tertiary);
				--mm--bg-negative: var(--text-normal);
				--mm--accent: var(--brand-experiment);
				--mm--text: var(--text-normal);
				--mm--text-negative: var(--background-primary);
			}

			[data-memessages-tooltip]{
				position: relative;
				--text: '';
				--width: auto;
				--offset: 0px;
				--ws: normal;
			}

			[data-memessages-tooltip]:after{
				content: var(--text);
				position: absolute;
				padding: 10px;
				margin-top: -10px;
				top: calc(100% + 10px);
				left: 0;
				width: var(--width);
				transform: translateX(var(--offset));
				background: var(--mm--bg);
				border-radius: 5px;
				font-size: 0.85em;
				line-height: 130%;
				white-space: var(--ws);
				color: var(--mm--text);
				box-shadow: 0 2px 5px 1px rgba(0, 0, 0, 0.3);
				pointer-events: none;
				transition: all 0.2s ease;
				opacity: 0;
				z-index: 9999;
			}

			[data-memessages-tooltip]:hover:after{
				margin-top: 0px;
				opacity: 1;
			}

			.memessages--mute-toggle{
				position: relative;
				z-index: 9999;
			}
			
			.memessages--mute-toggle i{
				position: relative;
				transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
			}

			.memessages--mute-toggle i:before{
				clip-path: polygon(0% 0%, 0% 100%, 100% 100%, 100% 90%, 0% 0%, 100% 0%, 100% 55%, 20% 0%);
			}

			.memessages--mute-toggle i:after{
				content: '';
				position: absolute;
				top: 50%;
				left: 50%;
				width: 2px;
				height: 24px;
				margin-top: -12px;
				margin-left: -1px;
				background: currentColor;
				border-radius: 2px;
				transform: rotate(-45deg);
			}

			.memessages--mute-toggle img{
				position: absolute;
				top: 50%;
				left: 50%;
				width: 18px;
				height: 18px;
				margin-top: -9px;
				margin-left: -9px;
				transition: all 0.7s cubic-bezier(0.34, 1.56, 0.64, 1);
				transform: scale(0) translateY(-2px) rotate(-10deg);
				pointer-events: none;
				z-index: -1;
			}

			.memessages--mute-toggle.on i{
				transform: translateX(-7px);
			}

			.memessages--mute-toggle.on i:before{
				clip-path: none;
			}

			.memessages--mute-toggle.on i:after{
				display: none;
			}

			.memessages--mute-toggle.on img{
				transition-timing-function: cubic-bezier(0.34, 7.56, 0.64, 1);
				transform: scale(1) translateX(5px);
			}

			.memessages--toolbar-btn{
				position: relative;
				display: inline-flex;
				justify-content: center;
				align-items: center;
				width: 40px;
				height: 24px;
				cursor: pointer;
			}

			.memessages--toolbar-btn i{
				opacity: 0.85;
			}

			.memessages--toolbar-btn img{
				position: absolute;
				bottom: 0;
				right: 0;
				width: 18px;
				height: 18px;
			}

			.memessages--toolbar-btn:hover i{
				opacity: 1;
			}

			.memessages--toolbar-btn.hide{
				display: none;
			}

			.memessages--channel-btn{
				z-index: 2;
			}

			.memessages--channel-btn img{
				pointer-events: none;
			}

			.memessages--channel-btn .memessages--channel-btn--icon-on{
				display: none;
			}

			.memessages--channel-btn .memessages--channel-btn--icon-off{
				display: inline-block;
			}

			.memessages--channel-btn.on .memessages--channel-btn--icon-on{
				display: inline-block;
			}

			.memessages--channel-btn.on .memessages--channel-btn--icon-off{
				display: none;
			}

			.memessages--channel-btn.on img{
				animation: memessages--jump 0.5s ease;
			}

			@keyframes memessages--jump{
				0%{
					transform: scale(1);
				}

				50%{
					transform: scale(4);
				}

				100%{
					transform: scale(1);
				}
			}

			.memessages--sidebar{
				position: relative;
				flex: 0 0 0px;
				transition: all 0.3s ease;
				z-index: 999;
			}

			.memessages--sidebar:before{
				content: '';
				position: absolute;
				top: 0;
				right: 0;
				bottom: 0;
				width: 600px;
				background: linear-gradient(to right, transparent 0%, rgba(0, 0, 0, 0.5) 100%);
				transition: all 0.3s ease;
				transform: translateX(100%);
				visibility: hidden;
				pointer-events: none;
				z-index: -2;
			}

			.memessages--sidebar--scrollbox{
				position: absolute;
				padding: 15px;
				padding-right: 5px;
				top: 0;
				right: 0;
				width: 380px;
				max-height: 100%;
				overflow-x: hidden;
				overflow-y: scroll;
				box-sizing: border-box;
				transition: all 0.3s ease,
							padding-right 0s linear;
				transform: translateX(100%);
				visibility: hidden;
			}

			.memessages--sidebar--scrollbox.hide{
				transform: translateX(100%)!important;
				visibility: hidden!important;
			}

			.memessages--sidebar--scrollbox.blur{
				padding-right: 15px;
				overflow: hidden;
				transform: translateX(-20px) scale(0.95)!important;
				filter: blur(1px) grayscale(1);
				opacity: 0.5;
			}

			.memessages--sidebar--scrollbox.blur > *{
				pointer-events: none;
			}

			.memessages--sidebar--scrollbox::-webkit-scrollbar{
				width: 10px;
			}

			.memessages--sidebar--scrollbox::-webkit-scrollbar-track{
				background: transparent;
			}

			.memessages--sidebar--scrollbox::-webkit-scrollbar-thumb{
				background: var(--mm--bg-negative);
				border: 3px solid transparent;
				border-radius: 100px;
				background-clip: padding-box;
			}

			.memessages--sidebar--floating-btn{
				position: absolute;
				top: 0;
				right: 380px;
				display: flex;
				justify-content: center;
				align-items: center;
				width: 50px;
				height: 50px;
				background: var(--mm--bg);
				border-radius: 50%;
				font-size: 22px;
				color: var(--mm--text);
				transition: all 0.3s ease,
							background 0.2s ease,
							color 0.2s ease;
				transform: translateX(430px);
				visibility: hidden;
				box-shadow: 0 2px 5px 1px rgba(0, 0, 0, 0.3);
				pointer-events: auto;
				cursor: pointer;
				z-index: -1;
			}

			.memessages--sidebar--floating-btn:hover{
				background: var(--mm--accent);
				color: var(--mm-color--white);
			}

			.memessages--sidebar--close{
				top: 25px;
			}

			.memessages--sidebar--pin{
				top: 85px;
			}

			.memessages--sidebar--history{
				padding-bottom: 5px;
				display: flex;
				flex-direction: column;
				word-break: break-all;
				user-select: text;
			}

			.memessages--sidebar.open:before{
				transition-delay: 0.15s;
				transform: none;
				visibility: visible;
			}

			.memessages--sidebar.open .memessages--sidebar--scrollbox{
				transform: none;
				visibility: visible;
			}

			.memessages--sidebar.open .memessages--sidebar--floating-btn{
				transform: none;
				visibility: visible;
				transition: all 0.6s ease,
							background 0.2s ease,
							color 0.2s ease;
			}

			.memessages--sidebar.pin{
				flex: 0 0 380px;
			}

			.memessages--sidebar.pin:before{
				transition-delay: 0s;
				transform: translateX(100%);
				visibility: hidden;
			}

			.memessages--sidebar.pin .memessages--sidebar--scrollbox{
				transform: none;
				visibility: visible;
			}

			.memessages--sidebar.pin .memessages--sidebar--floating-btn{
				transition: all 0.3s ease;
				transform: translateX(70px);
				visibility: hidden;
			}

			.memessages--card{
				display: flex;
				flex-direction: column;
				margin-bottom: 15px;
				padding: 20px;
				gap: 20px;
				background: var(--mm--bg);
				border-radius: 5px;
				font-size: 1.1em;
				line-height: 130%;
				color: var(--mm--text);
				box-sizing: border-box;
				transition: all 0.3s ease;
				box-shadow: inset 0 -1px 0 1px rgba(0, 0, 0, 0.1),
							inset 0 0 0 -100px var(--mm--accent),
							0 0 0 0 rgba(0, 0, 0, 0.3);
			}

			.memessages--card.sticky{
				position: sticky;
				top: -15px;
				z-index: 999;
				box-shadow: inset 0 -1px 0 1px rgba(0, 0, 0, 0.1),
							inset 103px 0 0 -100px var(--mm--accent),
							0 0 0 0 rgba(0, 0, 0, 0.3);
			}

			.memessages--card.stuck{
				box-shadow: inset 0 -1px 0 1px rgba(0, 0, 0, 0.1),
							inset 0 0 0 -100px var(--mm--accent),
							0 2px 5px 1px rgba(0, 0, 0, 0.3);
			}

			.memessages--card.sticky.stuck{
				border-top-left-radius: 0;
				border-top-right-radius: 0;
				box-shadow: inset 0 -1px 0 1px rgba(0, 0, 0, 0.1),
							inset 103px 0 0 -100px var(--mm--accent),
							0 2px 5px 1px rgba(0, 0, 0, 0.3);
			}

			.memessages--card > img,
			.memessages--card > audio{
				width: 100%;
			}

			.memessages--card--setting{
				display: flex;
				align-items: center;
				gap: 15px;
				min-height: 25px;
				line-height: 1;
			}

			.memessages--card--setting.clickable{
				margin: -10px;
				padding: 10px;
				border-radius: 5px;
				cursor: pointer;
			}

			.memessages--card--setting.clickable:hover{
				background: var(--mm--accent);
				color: var(--mm-color--white);
			}

			.memessages--card--setting.delimiter{
				min-height: 0;
			}

			.memessages--card--setting.delimiter:before{
				content: '';
				display: block;
				width: 100%;
				height: 1px;
				background: var(--mm--bg-second);
			}

			.memessages--card--setting--label{
				display: flex;
				align-items: center;
				gap: 15px;
				white-space: nowrap;
			}

			.memessages--card--setting--label--title{
				font-size: 1em;
			}

			.memessages--card--setting--label--desc{
				font-size: 0.7em;
			}

			.memessages--pill{
				padding: 5px 10px;
				min-width: 35px;
				background: var(--mm--bg-second);
				border-radius: 100px;
				font-size: 0.7em;
				font-weight: 600;
				text-align: center;
			}

			.memessages--username{
				display: inline-block;
				margin: 0 -5px;
				padding: 0 5px;
				color: var(--mm--accent);
				border-radius: 5px;
				cursor: pointer;
			}

			.memessages--username:hover{
				color: var(--mm-color--white);
				background: var(--mm--accent);
			}

			.memessages--toggle{
				position: relative;
				display: inline-block;
				width: 40px;
				height: 25px;
				background: var(--mm--bg-second);
				border-radius: 100px;
				transition: all 0.3s ease;
				cursor: pointer;
			}

			.memessages--toggle:after{
				content: '';
				position: absolute;
				top: 2px;
				left: 2px;
				width: 21px;
				height: 21px;
				background: var(--mm-color--white);
				border-radius: 50%;
				transition: inherit;
			}

			.memessages--toggle.on{
				background: var(--mm--accent);
			}

			.memessages--toggle.on:after{
				transform: translateX(15px);
			}

			.memessages--slider{
				position: relative;
				margin: 0 8px;
				width: 100%;
				height: 10px;
				background: var(--mm--bg-second);
				border-radius: 100px;
				cursor: pointer;
				--value: 0;
			}

			.memessages--slider:before{
				content: '';
				position: absolute;
				top: 0;
				left: 0;
				width: calc(var(--value) * 100%);
				max-width: 100%;
				height: 100%;
				background: var(--mm--accent);
				border-radius: 100px;
			}

			.memessages--slider:after{
				content: '';
				position: absolute;
				top: 50%;
				left: calc(var(--value) * 100%);
				width: 16px;
				height: 16px;
				margin-top: -8px;
				margin-left: -8px;
				background: var(--mm-color--white);
				border-radius: 50%;
				box-shadow: 0 2px 5px 1px rgba(0, 0, 0, 0.3);
				cursor: grab;
			}

			.memessages--slider:active,
			.memessages--slider:active:after{
				cursor: grabbing;
			}

			.memessages--slider.progress{
				margin: 0;
			}

			.memessages--slider.progress:after{
				display: none;
			}

			.memessages--input{
				position: relative;
				display: inline-flex;
				padding: 0 10px;
				height: 25px;
				background: var(--mm--bg);
				border: none;
				border-radius: 5px;
				box-shadow: 0 0 0 1px var(--mm--bg-second);
				font-size: 0.75em;
				line-height: 25px;
				color: var(--mm--text);
				transition: all 0.2s ease;
				-webkit-appearance: none;
			}
			
			.memessages--input:focus{
				box-shadow: 0 0 0 3px var(--mm--accent)!important;
			}

			.memessages--input .memessages--input{
				margin-left: 1px;
				background: transparent;
				border-radius: 0;
				box-shadow: 6px 0 0 -5px var(--mm--bg-second);
				font-size: 1em;
			}

			.memessages--input .memessages--input:first-child{
				margin-left: -10px;
				border-radius: 5px 0 0 5px;
			}

			.memessages--input .memessages--input:last-child{
				margin-right: -10px;
				border-radius: 0 5px 5px 0;
				box-shadow: none;
			}

			.memessages--input[type="color"]{
				padding: 0;
				overflow: hidden;
			}

			.memessages--input[type="color"]::-webkit-color-swatch-wrapper{
				padding: 0;
			}

			.memessages--input[type="color"]::-webkit-color-swatch{
				border: none;
			}

			.memessages--player{
				display: flex;
				justify-content: space-between;
				align-items: center;
				gap: 20px;
			}

			.memessages--player i{
				margin: -10px;
				padding: 10px;
				color: var(--mm--text);
				transition: all 0.2s ease;
				cursor: pointer;
			}

			.memessages--player i:hover{
				color: var(--mm--accent);
			}

			.memessages--discord-modal-content{
				color: var(--text-normal);
			}

			.memessages--discord-modal-content a{
				color: var(--brand-500);
			}
		`);

		this.render();
	}

	stop()
	{
		this.pluginEnabled = false;

		this.aggregateAudio(audio => (
			this.stopAudio(audio)
		));

		$.off();

		BdApi.DOM.removeStyle(this.meta.name);

		this.destroy();
	}

}
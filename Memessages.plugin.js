/**
 * @name Memessages
 * @author Greezor
 * @authorId 382062281623863298
 * @description Meme notifications
 * @version 0.0.1
 */

const MEOWPAD_API = 'https://api.meowpad.me/v2/sounds/search?q=';

// звук только в текущей конфе (типа закрепка)(фокус)
// прерывать другие звуки при новом сообщении
// окно с браузером звуков и/или подсказки autocomplete
// модификаторы в тексте типа [х2] (проиграть два раза или больше), также отступ и пагинация (может даже громкость/скорость/питч)
// кнопка временно заглушить
// кнопка отменить все текущие звуки (лучше модификатор)
// избранные звуки (может типа мини саундпад или просто коллекция любимых)
// сочетания клавиш для отмены звуков, глушилки и избранного
// история звуков (причём всех, не только своих)
// настройка дефолтной громкости/скорости/питча
// добавлять спойлер на текст сообщения (скрывать текст)
// звук уведомления дискорда (или вкл/выкл или даже кастом)
// всплывашки что за звук играет
// добавлять ссылку на звук к сообщению для тех у кого нет плагина
// заменять текст сообщения ссылкой на звук
// резервный сервер myinstants
// прерывать звук если сообщение удалили/отредачили (сочетание для быстрого удаления)
// !!! предупреждение что все данные отправляются на сервер (отключение предупреждения)
// придумать алгоритм отправки куска сообщения на сервер (не факт...)

module.exports = class Memessages {

	constructor(meta)
	{
		this.meta = meta;
		this.lastMessageID = null;
		this.channelFocus = null;
	}

	get dispatcher()
	{
		return BdApi.findModuleByProps('dispatch', 'subscribe');
	}

	get channelStore()
	{
		return BdApi.findModuleByProps('getLastSelectedChannelId');
	}

	fetch(options)
	{
		return new Promise((resolve, reject) => {
			require('request')(options, (error, response, data) => {
				if( error )
					return reject(new Error(error));

				if( response.statusCode != 200 )
					return reject(new Error(response.statusCode));

				return resolve(data);
			});
		});
	}

	async onMessage({ channelId, message, optimistic })
	{
		if(
			optimistic
			||
			this.lastMessageID == message.id
			||
			(
				!!this.channelFocus
				&&
				this.channelFocus != channelId
			)
		)	return;

		this.lastMessageID = message.id;

		const json = await this.fetch({
			url: MEOWPAD_API + encodeURIComponent(message.content),
			headers: {
				'accept-language': 'ru,en',
			},
		});

		const { sounds } = JSON.parse(json);

		if( !sounds.length ) return;

		const audioUrl = `https://api.meowpad.me/v2/sounds/preview/${
			sounds[0].id
		}.m4a`;

		await this.play(audioUrl);
	}

	async play(url)
	{
		const audio = new Audio(url);

		audio.addEventListener('canplaythrough', () => {
			audio.play();
		});

		await new Promise(resolve => {
			audio.addEventListener('ended', resolve);
		});
	}

	async start()
	{
		this.dispatcher.subscribe('MESSAGE_CREATE', e => this.onMessage(e));
	}

	stop()
	{
		this.dispatcher.unsubscribe('MESSAGE_CREATE', e => this.onMessage(e));
	}

}
const { Telegraf, Scenes, session, Markup } = require('telegraf');

// --- Чтение токена и ID администратора из переменных окружения ---
// На Bothost они задаются в панели управления
const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
    console.error("Ошибка: BOT_TOKEN не найден в переменных окружения");
    process.exit(1);
}

const ADMIN_ID = parseInt(process.env.ADMIN_ID);
if (!ADMIN_ID) {
    console.error("Ошибка: ADMIN_ID не найден в переменных окружения");
    process.exit(1);
}

// --- Создание бота ---
const bot = new Telegraf(BOT_TOKEN);

// --- Сцены для FSM (машина состояний) ---
// Сцена сбора описания
const descriptionScene = new Scenes.BaseScene('description');
descriptionScene.enter((ctx) => {
    ctx.reply('👋 Добро пожаловать в бот по скупке устройств!\n\n📱 Пожалуйста, опишите ваше устройство: модель, состояние, комплектацию и любые другие детали.');
});
descriptionScene.on('text', (ctx) => {
    ctx.session.description = ctx.message.text;
    ctx.reply('📸 Отлично! Теперь, пожалуйста, отправьте одно или несколько фотографий устройства.');
    ctx.scene.enter('photos');
});
descriptionScene.on('message', (ctx) => {
    ctx.reply('❓ Пожалуйста, опишите устройство текстом.');
});

// Сцена сбора фотографий
const photosScene = new Scenes.BaseScene('photos');
photosScene.enter((ctx) => {
    ctx.session.photos = [];
});
photosScene.on('photo', (ctx) => {
    // Получаем file_id самого большого фото
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    ctx.session.photos.push(photo.file_id);
    ctx.reply(`📸 Фото ${ctx.session.photos.length} получено. Отправьте еще фото или напишите "готово", чтобы продолжить.`);
});
photosScene.on('text', (ctx) => {
    if (ctx.message.text.toLowerCase() === 'готово') {
        if (ctx.session.photos.length === 0) {
            ctx.reply('⚠️ Вы не отправили ни одного фото. Пожалуйста, отправьте хотя бы одну фотографию.');
            return;
        }
        ctx.reply('💰 Отлично! Теперь укажите желаемую цену в рублях (цифрами).');
        ctx.scene.enter('price');
    } else {
        ctx.reply('❓ Отправьте фото или напишите "готово", если закончили.');
    }
});
photosScene.on('message', (ctx) => {
    ctx.reply('❓ Пожалуйста, отправьте фотографию.');
});

// Сцена сбора цены
const priceScene = new Scenes.BaseScene('price');
priceScene.enter((ctx) => {
    ctx.reply('💰 Укажите цену цифрами (например: 15000)');
});
priceScene.on('text', (ctx) => {
    const price = ctx.message.text;
    if (!/^\d+$/.test(price)) {
        ctx.reply('⚠️ Пожалуйста, введите цену цифрами. Например: 15000');
        return;
    }
    
    // --- Формируем и отправляем заявку админу ---
    const username = ctx.from.username || 'не указан';
    const userId = ctx.from.id;
    const description = ctx.session.description || 'Не указано';
    const photos = ctx.session.photos || [];
    
    let adminText = `🆕 **НОВАЯ ЗАЯВКА НА СКУПКУ!**\n\n`;
    adminText += `👤 **Пользователь:** @${username}\n`;
    adminText += `🆔 **ID:** \`${userId}\`\n\n`;
    adminText += `📝 **Описание:**\n${description}\n\n`;
    adminText += `💰 **Цена:** ${price} ₽\n\n`;
    adminText += `📸 **Фотографии:** (отправлены ниже)`;
    
    // Отправка админу
    ctx.telegram.sendMessage(ADMIN_ID, adminText, { parse_mode: 'Markdown' });
    
    // Отправка каждого фото админу
    for (const photoId of photos) {
        ctx.telegram.sendPhoto(ADMIN_ID, photoId);
    }
    
    ctx.reply('✅ Ваша заявка принята! Ожидайте, скоро с вами свяжется наш менеджер.');
    ctx.scene.leave();
});
priceScene.on('message', (ctx) => {
    ctx.reply('❓ Пожалуйста, введите цену цифрами.');
});

// --- Регистрация сцен и создание stage ---
const stage = new Scenes.Stage([descriptionScene, photosScene, priceScene]);
bot.use(session());
bot.use(stage.middleware());

// --- Команда /start ---
bot.start((ctx) => {
    ctx.session = {};
    ctx.scene.enter('description');
});

// --- Запуск бота (long polling) ---
bot.launch()
    .then(() => {
        console.log('✅ Бот успешно запущен и готов к работе!');
    })
    .catch((err) => {
        console.error('❌ Ошибка при запуске бота:', err);
        process.exit(1);
    });

// --- Обработка остановки ---
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

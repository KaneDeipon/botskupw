import asyncio
import os
import sys
import logging
from aiogram import Bot, Dispatcher, types, F
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import StatesGroup, State
from aiogram.fsm.storage.memory import MemoryStorage
from dotenv import load_dotenv

# Загружаем переменные из .env файла
load_dotenv()

# --- Настройки ---
BOT_TOKEN = os.getenv("BOT_TOKEN")
if not BOT_TOKEN:
    raise ValueError("BOT_TOKEN не найден в .env файле")

ADMIN_ID = int(os.getenv("ADMIN_ID", 0))
if ADMIN_ID == 0:
    raise ValueError("ADMIN_ID не найден или равен 0")

# --- Логирование в файл (чтобы видеть ошибки на PythonAnywhere) ---
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler("bot.log"),
        logging.StreamHandler(sys.stdout)
    ]
)

# --- FSM состояния ---
class ApplicationForm(StatesGroup):
    waiting_for_description = State()
    waiting_for_photos = State()
    waiting_for_price = State()

# --- Инициализация ---
storage = MemoryStorage()
bot = Bot(token=BOT_TOKEN)
dp = Dispatcher(storage=storage)

# --- Команда /start ---
@dp.message(Command("start"))
async def cmd_start(message: types.Message, state: FSMContext):
    await state.clear()
    await message.answer(
        "👋 Добро пожаловать в бот по скупке устройств!\n\n"
        "📱 Пожалуйста, опишите ваше устройство: модель, состояние, комплектацию и любые другие детали."
    )
    await state.set_state(ApplicationForm.waiting_for_description)

# --- Описание устройства ---
@dp.message(ApplicationForm.waiting_for_description, F.text)
async def process_description(message: types.Message, state: FSMContext):
    await state.update_data(description=message.text)
    await message.answer(
        "📸 Отлично! Теперь, пожалуйста, отправьте одно или несколько фотографий устройства."
    )
    await state.set_state(ApplicationForm.waiting_for_photos)

# --- Фотографии ---
@dp.message(ApplicationForm.waiting_for_photos, F.photo)
async def process_photos(message: types.Message, state: FSMContext):
    photo_ids = [photo.file_id for photo in message.photo]
    await state.update_data(photos=photo_ids)
    await message.answer(
        "💰 Отлично! Теперь укажите желаемую цену в рублях (цифрами)."
    )
    await state.set_state(ApplicationForm.waiting_for_price)

# --- Цена и финал ---
@dp.message(ApplicationForm.waiting_for_price, F.text)
async def process_price(message: types.Message, state: FSMContext):
    if not message.text.isdigit():
        await message.answer("⚠️ Пожалуйста, введите цену цифрами. Например: 15000")
        return

    await state.update_data(price=message.text)
    user_data = await state.get_data()

    # Формируем отчёт для админа
    username = message.from_user.username or "не указан"
    user_id = message.from_user.id

    admin_text = (
        f"🆕 **НОВАЯ ЗАЯВКА НА СКУПКУ!**\n\n"
        f"👤 **Пользователь:** @{username}\n"
        f"🆔 **ID:** `{user_id}`\n\n"
        f"📝 **Описание:**\n{user_data.get('description', 'Не указано')}\n\n"
        f"💰 **Цена:** {user_data.get('price', 'Не указана')} ₽\n\n"
        f"📸 **Фотографии:** (отправлены ниже)"
    )

    await bot.send_message(chat_id=ADMIN_ID, text=admin_text, parse_mode="Markdown")
    for photo_id in user_data.get('photos', []):
        await bot.send_photo(chat_id=ADMIN_ID, photo=photo_id)

    await message.answer("✅ Ваша заявка принята! Ожидайте, скоро с вами свяжется наш менеджер.")
    await state.clear()

# --- Обработчики некорректного ввода ---
@dp.message(ApplicationForm.waiting_for_description)
async def incorrect_description(message: types.Message):
    await message.answer("❓ Пожалуйста, опишите устройство текстом.")

@dp.message(ApplicationForm.waiting_for_photos)
async def incorrect_photos(message: types.Message):
    await message.answer("❓ Пожалуйста, отправьте фотографию (не файл, а именно фото).")

@dp.message(ApplicationForm.waiting_for_price)
async def incorrect_price(message: types.Message):
    await message.answer("❓ Пожалуйста, укажите цену цифрами.")

# --- Запуск ---
async def main():
    logging.info("Бот запущен")
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
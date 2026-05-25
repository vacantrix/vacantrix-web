# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Структура проекта

```
vacantrix-web/
├── index.html          ← Главная страница (каталог, авторизация, настройки)
├── admin.html          ← Панель администратора
├── schema.sql          ← SQL-схема таблиц Supabase
├── css/
│   └── main.css        (все стили)
├── js/
│   ├── config.js       (SUPABASE_URL, SUPABASE_ANON — точка конфигурации)
│   ├── auth.js         (Auth — email/password + OTP авторизация)
│   ├── platforms.js    (Platforms — вкладка площадок/ссылок)
│   ├── apps.js         (Apps — вкладка приложений, лайтбокс)
│   ├── main.js         (оркестратор главной страницы)
│   └── admin.js        (AdminPanel — управление контентом)
└── img/                (иконки, скриншоты приложений)
```

## Запуск

Статический сайт — просто открыть `index.html` в браузере или через Live Server.

Деплой:
```bash
git add .
git commit -m "описание изменений"
git push
```

GitHub Pages пересобирается автоматически (~1 мин).

- **Сайт:** `https://vacantrix.github.io/vacantrix-web/`
- **Админ-панель:** `https://vacantrix.github.io/vacantrix-web/admin.html`

## Конфигурация

Единственный файл с настройками — `js/config.js`:

```js
const SUPABASE_URL  = 'https://fgcffgfyehequucnxegb.supabase.co';
const SUPABASE_ANON = '...';  // anon/publishable ключ
```

Тот же Supabase-проект, что у `vacantrix-hh` и `vacantrix-platform`.

## Архитектура

**Стек:** Vanilla JS + Supabase JS SDK (CDN, без сборщика).

### Инициализация (`main.js`)

Порядок загрузки страницы:
1. Синхронно регистрируются все обработчики кнопок и модальных окон
2. Асинхронно (не блокируя UI) инициализируется `Auth.init()` с таймаутом 5 сек
3. Параллельно грузятся `Platforms.loadAndRender()` и `Apps.loadAndRender()`

### Авторизация (`auth.js`)

`Auth` — глобальный объект:

| Метод | Описание |
|-------|----------|
| `Auth.init()` | Восстанавливает сессию из localStorage |
| `Auth.loginPassword(email, pwd, remember)` | Вход по паролю; если `remember=false` → возвращает `{needsOtp: true}` |
| `Auth.verifyOtp(email, token)` | Подтверждение OTP-кода |
| `Auth.register(email, pwd)` | Регистрация |
| `Auth.signOut()` | Выход |
| `Auth.onChange(cb)` | Подписка на изменения сессии — `cb(user, isAdmin)` |
| `Auth.currentUser()` | Текущий пользователь (объект Supabase) |
| `Auth.isAdmin()` | Проверка роли admin |

Роли хранятся в таблице `web_user_roles`. Первый зарегистрировавшийся автоматически получает роль `admin`.

### Supabase (таблицы сайта)

| Таблица | Назначение |
|---------|-----------|
| `web_platforms` | Площадки/ссылки с категориями (HH, Avito и др.) |
| `web_apps` | Карточки приложений (name, slug, version, download_url, screenshots) |
| `web_user_roles` | Роли пользователей (`user` / `admin`) |

Таблицы изолированы от таблиц Telegram-бота (`users`, `subscriptions` и др.) — общий только Supabase-проект.

### Скачивание платформы

Кнопка «Скачать» на главной ведёт на:
```
https://github.com/vacantrix/vacantrix-platform/releases/latest/download/VacantrixLauncher.exe
```
Ссылка обновляется автоматически через `launcher/release.py` в `vacantrix-platform`.

## Связанные проекты

| Проект | Связь |
|--------|-------|
| `vacantrix-platform` | Публикует релизы EXE, которые раздаёт этот сайт |
| `vacantrix-hh` | Тот же Supabase-проект; Telegram-бот управляет подписками |

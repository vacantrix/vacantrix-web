# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Структура проекта

```
vacantrix-web/
├── index.html                  ← Главная страница (каталог, авторизация, настройки)
├── schema.sql                  ← SQL-схема таблиц Supabase
├── vx_profiles_migration.sql   ← Миграция таблицы vx_profiles (уже применена)
├── css/
│   └── main.css                (все стили, включая .coming-soon)
├── js/
│   ├── config.js       (SUPABASE_URL, SUPABASE_ANON — точка конфигурации)
│   ├── auth.js         (Auth — email/password + OTP авторизация)
│   ├── profile.js      (Profile — загрузка vx_profiles, displayName, subscriptionText)
│   ├── platforms.js    (Platforms — вкладка «Наши площадки», сейчас статический «Скоро»)
│   ├── apps.js         (Apps — вкладка приложений, лайтбокс, скачивание)
│   └── main.js         (оркестратор главной страницы)
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

> ⚠️ Админ-панель удалена из сайта (2026-06-28). Управление контентом (площадки/приложения) будет
> отдельным приложением управления экосистемой. Таблица `web_user_roles` и RLS-роль `admin` оставлены
> как бэкенд-авторизация (нужны для записи в `web_apps`/`web_platforms` и партнёрскую программу).

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
3. `Profile.load(userId)` подтягивает `vx_profiles` после авторизации
4. `Platforms.loadAndRender()` — **синхронная** функция, рисует статический «Скоро»
5. `Apps.loadAndRender()` — загружает карточки приложений из `web_apps`

### Авторизация (`auth.js`)

`Auth` — глобальный объект:

| Метод | Описание |
|-------|----------|
| `Auth.init()` | Восстанавливает сессию из localStorage |
| `Auth.loginPassword(email, pwd, remember)` | Вход по паролю; если `remember=false` → возвращает `{needsOtp: true}` |
| `Auth.verifyOtp(email, token)` | Подтверждение OTP-кода |
| `Auth.register(email, pwd)` | Регистрация |
| `Auth.signOut()` | Выход |
| `Auth.onChange(cb)` | Подписка на изменения сессии — `cb(user)` |
| `Auth.currentUser()` | Текущий пользователь (объект Supabase) |

Роль `admin` хранится в таблице `web_user_roles` и используется только как бэкенд-авторизация (RLS).
Клиентской проверки роли на сайте больше нет — админ-панель удалена.

### Профиль (`profile.js`)

`Profile` — глобальный объект:

| Метод | Описание |
|-------|----------|
| `Profile.load(userId)` | Загружает запись из `vx_profiles` по `web_user_id` |
| `Profile.current()` | Текущий профиль (объект из vx_profiles) |
| `Profile.displayName()` | Возвращает `display_name` или `null` |
| `Profile.subscriptionText()` | Текст и флаг активности подписки |
| `Profile.linkHH(hhId, userId)` | Привязывает `hh_applicant_id` к профилю |
| `Profile.linkAvito(avitoId, userId)` | Привязывает `avito_user_id` к профилю |
| `Profile.unlink()` | Сбрасывает привязки приложений |

### Вкладка «Площадки» (`platforms.js`)

Статический блок — **не читает БД**. Показывает заглушку «Скоро».
Будет наполнена ссылками на соцсети и каналы Vacantrix (Telegram, VK и др.).

### Вкладка «Приложения» (`apps.js`)

Читает `web_apps` из Supabase. Кнопка скачивания требует авторизации (`Auth.isLoggedIn()`).

### Supabase (таблицы сайта)

| Таблица | Назначение |
|---------|-----------|
| `web_platforms` | Наши каналы/сообщества (Telegram, VK и др.) — пока пустая |
| `web_apps` | Карточки приложений (name, download_url, screenshots и др.) |
| `web_user_roles` | Роли пользователей (`user` / `admin`) — бэкенд-authz (RLS), без UI на сайте |
| `vx_profiles` | Единый профиль пользователя (display_name, hh_applicant_id, avito_user_id, подписка) |

`vx_profiles` — кросс-проектная таблица, общая с `vacantrix-platform` и `vacantrix-hh`.

### Скачивание платформы

Hero-кнопка «Скачать Vacantrix Platform» ведёт на:
```
https://github.com/vacantrix/vacantrix-platform/releases/download/v1.0.0/VacantrixLauncher.exe
```

> ⚠️ URL захардкожен на `v1.0.0` — в репо platform два релиза, `/latest/` указывает на `avito-v1.0.0`
> где нет `VacantrixLauncher.exe`. После удаления лишнего релиза вернуть `/releases/latest/download/`.

Все URL приложений в `web_apps`:
- `Vacantrix` (HH-бот): `github.com/vacantrix/Vacantrixbot/releases/latest/download/Vacantrix.exe`
- `Vacantrix Platform`: `github.com/vacantrix/vacantrix-platform/releases/download/v1.0.0/VacantrixLauncher.exe`
- `Vacantrix Авито`: `github.com/vacantrix/vacantrix-avito/releases/latest/download/VacantrixAvito.exe`

## Связанные проекты

| Проект | Связь |
|--------|-------|
| `vacantrix-platform` | Публикует релизы EXE (`VacantrixLauncher.exe`), раздаёт этот сайт |
| `vacantrix-hh` | Тот же Supabase-проект; Telegram-бот управляет подписками |
| `vacantrix-avito` | Авито-бот, отдельный репо; релиз `vacantrix-avito/VacantrixAvito.exe` |
| `vacantrix-tasks` | Биржа задач — использует те же `vx_profiles` |

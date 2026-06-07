// ===== CHATLY i18n =====
const TRANSLATIONS = {
  ru: {
    auth_subtitle:'Современный мессенджер',login:'Войти',register_tab:'Регистрация',
    ph_username:'Имя пользователя',ph_password:'Пароль',login_btn:'Войти →',
    ph_displayname:'Ваше имя',ph_username_login:'Логин',ph_password_min:'Пароль (мин. 4)',register_btn:'Создать аккаунт ✨',
    err_connection:'Ошибка соединения',err_taken:'Имя занято',err_invalid:'Неверные данные',
    ph_search:'Поиск...',online:'online',offline:'offline',
    welcome_title:'Добро пожаловать в Chatly!',welcome_subtitle:'Выберите чат слева',
    feat_dm:'ЛС',feat_groups:'Группы',feat_channels:'Каналы',feat_calls:'Звонки',
    tab_dms:'ЛС',tab_groups:'Группы',tab_channels:'Каналы',
    ph_message:'Написать сообщение...',typing:'печатает...',no_messages:'Нет сообщений',
    today:'Сегодня',yesterday:'Вчера',
    settings:'Настройки',tab_profile:'Профиль',tab_theme:'Тема',tab_font:'Шрифт',
    label_name:'Имя',label_bio:'О себе',ph_bio:'Расскажите о себе...',label_login:'Логин',label_status:'Статус',
    save_changes:'Сохранить',logout:'Выйти',
    theme_default:'Стандартная',theme_select:'🎨 Выберите тему',theme_pro_only:'💎 Темы доступны в PRO',theme_need_pro:'💎 Нужен PRO для этой темы',
    font_pro_only:'💎 Шрифты доступны в PRO',font_select:'🔤 Выберите шрифт',
    pro_tagline:'Разблокируй всё!',pro_f1:'Темы оформления',pro_f_font:'Кастомные шрифты',pro_f2:'Реакции',pro_f3:'Статус прочитания',
    pro_f4:'Закрепление',pro_f5:'PRO бейдж',pro_f_calls:'HD звонки',pro_f_files:'Файлы до 5ГБ',
    pro_active:'💎 Chatly PRO активен!',pro_active_sub:'Все премиум функции разблокированы',
    pro_free:'🆓 Бесплатный аккаунт',pro_free_sub:'Обновите до PRO для расширенного функционала',
    pro_pending:'⏳ Запрос на PRO ожидает',pro_pending_sub:'Администратор рассмотрит запрос',
    pro_request_btn:'🚀 Запросить PRO',pro_request_sent:'✅ Запрос отправлен! Ожидайте подтверждения.',
    pro_already_pending:'⏳ Запрос уже ожидает',pro_granted_toast:'💎 Добро пожаловать в Chatly PRO!',
    pro_removed_toast:'🔻 PRO подписка отменена',
    profile_saved:'✅ Профиль обновлён!',profile_error:'❌ Ошибка сохранения',copied:'📋 Скопировано!',
    ctx_react:'😍 Реакция',ctx_pin:'📌 Закрепить',ctx_copy:'📋 Копировать',pinned:'📌 Закреплено',
    // Groups
    group_name:'Название',group_desc:'Описание',group_type:'Тип',type_group:'Группа',type_channel:'Канал',
    add_members:'Добавить участников',create_btn:'Создать',cancel:'Отмена',
    group_created:'✅ Группа создана!',channel_created:'✅ Канал создан!',
    group_info:'Информация',members:'Участники',rank:'Ранг',
    rank_owner:'Владелец',rank_admin:'Админ',rank_moderator:'Модератор',rank_vip:'VIP',rank_member:'Участник',
    leave_group:'Покинуть',delete_group:'Удалить группу',
    kick_user:'Кикнуть',change_rank:'Изменить ранг',
    file_too_big:'❌ Файл слишком большой (макс. 500МБ)',file_too_big_pro:'❌ Макс. 5ГБ для PRO',
    voice_recording:'🎙️ Запись...',voice_sent:'🎙️ Голосовое отправлено',
    call_incoming:'Входящий звонок',call_video:'Видео звонок',call_audio:'Аудио звонок',
    call_connecting:'Подключение...',call_ended:'Звонок завершён',call_rejected:'Звонок отклонён',call_unavailable:'Абонент недоступен',
    upload_progress:'Загрузка файла...',
    msg_file:'Файл',msg_voice:'Голосовое',
    you:'Вы',
    send_message_in_channel:'Только администраторы могут писать в канал',
  },
  ua: {
    auth_subtitle:'Сучасний месенджер',login:'Увійти',register_tab:'Реєстрація',
    ph_username:"Ім'я користувача",ph_password:'Пароль',login_btn:'Увійти →',
    ph_displayname:"Ваше ім'я",ph_username_login:'Логін',ph_password_min:'Пароль (мін. 4)',register_btn:'Створити акаунт ✨',
    err_connection:"Помилка з'єднання",err_taken:"Ім'я зайнято",err_invalid:'Невірні дані',
    ph_search:'Пошук...',online:'online',offline:'offline',
    welcome_title:'Ласкаво просимо в Chatly!',welcome_subtitle:'Оберіть чат зліва',
    feat_dm:'ЛС',feat_groups:'Групи',feat_channels:'Канали',feat_calls:'Дзвінки',
    tab_dms:'ЛС',tab_groups:'Групи',tab_channels:'Канали',
    ph_message:'Написати повідомлення...',typing:'друкує...',no_messages:'Немає повідомлень',
    today:'Сьогодні',yesterday:'Вчора',
    settings:'Налаштування',tab_profile:'Профіль',tab_theme:'Тема',tab_font:'Шрифт',
    label_name:"Ім'я",label_bio:'Про себе',ph_bio:'Розкажіть про себе...',label_login:'Логін',label_status:'Статус',
    save_changes:'Зберегти',logout:'Вийти',
    theme_default:'Стандартна',theme_select:'🎨 Оберіть тему',theme_pro_only:'💎 Теми доступні в PRO',theme_need_pro:'💎 Потрібен PRO для цієї теми',
    font_pro_only:'💎 Шрифти доступні в PRO',font_select:'🔤 Оберіть шрифт',
    pro_tagline:'Розблокуй усі можливості!',pro_f1:'Темі оформлення',pro_f_font:'Кастомні шрифти',pro_f2:'Реакції',pro_f3:'Статус прочитання',
    pro_f4:'Закріплення',pro_f5:'PRO бейдж',pro_f_calls:'HD дзвінки',pro_f_files:'Файли до 5ГБ',
    pro_active:'💎 Chatly PRO активний!',pro_active_sub:'Усі преміум функції розблоковані',
    pro_free:'🆓 Безкоштовний акаунт',pro_free_sub:"Оновіть до PRO для розширеного функціоналу",
    pro_pending:'⏳ Запит на PRO очікує',pro_pending_sub:'Адміністратор розгляне запит',
    pro_request_btn:'🚀 Запросити PRO',pro_request_sent:'✅ Запит відправлено! Чекайте підтвердження.',
    pro_already_pending:'⏳ Запит вже очікує',pro_granted_toast:'💎 Ласкаво просимо в Chatly PRO!',
    pro_removed_toast:'🔻 PRO підписку скасовано',
    profile_saved:'✅ Профіль оновлено!',profile_error:'❌ Помилка збереження',copied:'📋 Скопійовано!',
    ctx_react:'😍 Реакція',ctx_pin:'📌 Закріпити',ctx_copy:'📋 Копіювати',pinned:'📌 Закріплено',
    group_name:'Назва',group_desc:'Опис',group_type:'Тип',type_group:'Група',type_channel:'Канал',
    add_members:'Додати учасників',create_btn:'Створити',cancel:'Скасувати',
    group_created:'✅ Група створена!',channel_created:'✅ Канал створено!',
    group_info:'Інформація',members:'Учасники',rank:'Ранг',
    rank_owner:'Власник',rank_admin:'Адмін',rank_moderator:'Модератор',rank_vip:'VIP',rank_member:'Учасник',
    leave_group:'Покинути',delete_group:'Видалити групу',
    kick_user:'Викинути',change_rank:'Змінити ранг',
    file_too_big:'❌ Файл занадто великий (макс. 500МБ)',file_too_big_pro:'❌ Макс. 5ГБ для PRO',
    voice_recording:'🎙️ Запис...',voice_sent:'🎙️ Голосове відправлено',
    call_incoming:'Вхідний дзвінок',call_video:'Відео дзвінок',call_audio:'Аудіо дзвінок',
    call_connecting:'Підключення...',call_ended:'Дзвінок завершено',call_rejected:'Дзвінок відхилено',call_unavailable:'Абонент недоступний',
    upload_progress:'Завантаження файлу...',
    msg_file:'Файл',msg_voice:'Голосове',
    you:'Ви',
    send_message_in_channel:'Тільки адміністратори можуть писати в канал',
  }
};

let currentLang = localStorage.getItem('chatly_lang') || 'ru';
function t(key) { return TRANSLATIONS[currentLang]?.[key] || TRANSLATIONS['ru']?.[key] || key; }
function setLang(lang) {
  currentLang = lang;
  localStorage.setItem('chatly_lang', lang);
  applyTranslations();
  updateLangButtons();
}
function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (TRANSLATIONS[currentLang]?.[key]) el.textContent = TRANSLATIONS[currentLang][key];
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (TRANSLATIONS[currentLang]?.[key]) el.placeholder = TRANSLATIONS[currentLang][key];
  });
}
function updateLangButtons() {
  document.querySelectorAll('.lang-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.lang === currentLang));
}
document.addEventListener('DOMContentLoaded', () => {
  updateLangButtons();
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setLang(btn.dataset.lang);
      if (typeof renderCurrentContacts === 'function') renderCurrentContacts();
      if (activeChat && activeChatType === 'dm') loadMessages(activeChat);
      if (activeChat && activeChatType === 'group') loadGroupMessages(activeChat);
      if (currentUser) updateProStatus();
    });
  });
  applyTranslations();
});

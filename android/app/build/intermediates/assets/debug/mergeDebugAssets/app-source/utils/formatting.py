def format_date(date_str):
    if not date_str:
        return ""
    try:
        return f"{date_str[:4]}/{date_str[4:6]}/{date_str[6:]}"
    except (IndexError, TypeError):
        return str(date_str)

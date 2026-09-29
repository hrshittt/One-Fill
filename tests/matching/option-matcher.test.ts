import { describe, expect, it } from 'vitest';
import { analyzeOptions, matchOption, scoreNumeric } from '../../src/matching/option-matcher';
import type { FieldOption } from '../../src/types/fields';

const opts = (...items: Array<string | [string, string]>): FieldOption[] =>
  items.map((item, i) => {
    const [text, value] = Array.isArray(item) ? item : [item, item];
    return { id: String(i), text, value, disabled: false };
  });

const pick = (value: string, options: FieldOption[], set?: Parameters<typeof matchOption>[2], ctx?: Parameters<typeof matchOption>[3]) => {
  const m = matchOption(value, options, set, ctx);
  return m ? options[m.index]!.text : null;
};

describe('gender', () => {
  it.each([
    [opts('Select', 'Male', 'Female', 'Other'), 'Male'],
    [opts('M', 'F'), 'M'],
    [opts('Man', 'Woman', 'Non-binary'), 'Man'],
    [opts(['Male', '1'], ['Female', '2']), 'Male'],
    [opts('Female', 'Male'), 'Male'],
  ])('male → %#', (options, expected) => {
    expect(pick('male', options, 'gender')).toBe(expected);
  });

  it('never confuses Male with Female through substring matching', () => {
    expect(pick('male', opts('Female', 'Other'), 'gender')).toBeNull();
  });

  it('matches "prefer not to say" variants', () => {
    expect(pick('prefer-not-to-say', opts('Male', 'Female', 'Decline to self-identify'), 'gender')).toBe('Decline to self-identify');
  });
});

describe('countries and nationality', () => {
  const countries = opts('-- Select --', 'Afghanistan', 'India', 'Indonesia', 'United States', 'United Kingdom');

  it.each(['India', 'india', 'IN', 'IND', 'Bharat'])('%s → India', (value) => {
    expect(pick(value, countries, 'country')).toBe('India');
  });

  it('matches by ISO code in the option value', () => {
    expect(pick('India', opts(['Select', ''], ['India', 'IN'], ['Nepal', 'NP']), 'country')).toBe('India');
    expect(pick('United States', opts(['USA', 'US'], ['Canada', 'CA']), 'country')).toBe('USA');
  });

  it('matches options with extra decoration', () => {
    expect(pick('India', opts('Nepal (+977)', 'India (+91)'), 'country')).toBe('India (+91)');
  });

  it('maps nationality between country names and demonyms', () => {
    expect(pick('Indian', opts('American', 'Indian', 'British'), 'nationality')).toBe('Indian');
    expect(pick('Indian', opts('United States', 'India', 'Nepal'), 'nationality')).toBe('India');
    expect(pick('India', opts('American', 'Indian'), 'nationality')).toBe('Indian');
  });

  it('does not pick Indonesia for India', () => {
    expect(pick('India', opts('Indonesia', 'Iran'), 'country')).toBeNull();
  });
});

describe('states', () => {
  it('matches full names and abbreviations', () => {
    expect(pick('Rajasthan', opts('Select State', 'Punjab', 'Rajasthan', 'Sikkim'), 'state')).toBe('Rajasthan');
    expect(pick('Rajasthan', opts(['PB', 'PB'], ['RJ', 'RJ']), 'state')).toBe('RJ');
    expect(pick('California', opts('CA', 'NY', 'TX'), 'state')).toBe('CA');
    expect(pick('Delhi', opts('NCT of Delhi', 'Haryana'), 'state')).toBe('NCT of Delhi');
  });
});

describe('dates, numbers and ranges', () => {
  it('matches months in any notation', () => {
    const months = opts('Month', 'January', 'February', 'March', 'April');
    expect(pick('03', months, 'month')).toBe('March');
    expect(pick('03', opts('Jan', 'Feb', 'Mar'), 'month')).toBe('Mar');
    expect(pick('03', opts('01', '02', '03'), 'month')).toBe('03');
    expect(pick('03', opts('1', '2', '3'), 'month')).toBe('3');
  });

  it('matches zero-padded days and years numerically', () => {
    expect(pick('05', opts('Day', ...Array.from({ length: 31 }, (_, i) => String(i + 1))), 'numeric')).toBe('5');
    expect(pick('2003', opts('2001', '2002', '2003'), 'numeric')).toBe('2003');
  });

  it('picks the right experience bucket', () => {
    const buckets = opts('Fresher', '0-1 years', '1-2 years', '2-5 years', '5+ years');
    expect(pick('0', buckets, 'numeric')).toBe('Fresher');
    expect(pick('1', buckets, 'numeric')).toBe('1-2 years');
    expect(pick('3', buckets, 'numeric')).toBe('2-5 years');
    expect(pick('7', buckets, 'numeric')).toBe('5+ years');
    expect(pick('12', opts('Less than 1 year', '1 to 10 years', 'More than 10 years'), 'numeric')).toBe('More than 10 years');
  });

  it('scores numeric formats', () => {
    expect(scoreNumeric(3, '3')).toBeGreaterThan(0.9);
    expect(scoreNumeric(3, '2 - 4 yrs')).toBeGreaterThan(0.8);
    expect(scoreNumeric(3, '10 years and above')).toBe(0);
  });
});

describe('education', () => {
  it('matches degree abbreviations', () => {
    expect(pick('B.Tech', opts('Select', 'B.E.', 'B.Tech', 'M.Tech'), 'degree')).toBe('B.Tech');
    expect(pick('B.Tech', opts('Bachelor of Technology', 'Master of Technology'), 'degree')).toBe('Bachelor of Technology');
    expect(pick('B.Tech', opts('B.Sc', 'B.E./B.Tech', 'MBA'), 'degree')).toBe('B.E./B.Tech');
  });

  it('matches education levels', () => {
    expect(pick('bachelors', opts('10th', '12th', 'Graduate', 'Post Graduate'), 'educationLevel')).toBe('Graduate');
    expect(pick('bachelors', opts("Bachelor's Degree", "Master's Degree", 'Doctorate'), 'educationLevel')).toBe("Bachelor's Degree");
    expect(pick('masters', opts('Under Graduate', 'Post Graduate'), 'educationLevel')).toBe('Post Graduate');
  });
});

describe('calling codes', () => {
  it('finds the code in varied formats', () => {
    expect(pick('+91', opts('+1', '+44', '+91'), 'callingCode')).toBe('+91');
    expect(pick('+91', opts('United States (+1)', 'India (+91)'), 'callingCode')).toBe('India (+91)');
    expect(pick('+91', opts(['IN +91', 'IN'], ['NP +977', 'NP']), 'callingCode')).toBe('IN +91');
  });

  it('breaks +1 ties with the user’s country, and refuses to guess otherwise', () => {
    const options = opts('Canada (+1)', 'United States (+1)', 'India (+91)');
    expect(pick('+1', options, 'callingCode', { country: 'United States' })).toBe('United States (+1)');
    expect(pick('+1', options, 'callingCode')).toBeNull();
  });
});

describe('safety', () => {
  it('ignores placeholder and disabled options', () => {
    const options: FieldOption[] = [
      { id: '0', text: 'Select gender', value: '', disabled: false },
      { id: '1', text: 'Male', value: 'm', disabled: true },
      { id: '2', text: 'Female', value: 'f', disabled: false },
    ];
    expect(matchOption('male', options, 'gender')).toBeNull();
  });

  it('returns null when two different options are equally plausible', () => {
    expect(pick('Delhi', opts('New Delhi', 'Delhi Cantonment', 'Delhi NCR'))).toBeNull();
  });

  it('matches free text exactly or not at all for near-miss institution names', () => {
    const unis = opts('Manipal University', 'Manipal University Jaipur', 'Amity University');
    expect(pick('Manipal University Jaipur', unis)).toBe('Manipal University Jaipur');
    expect(pick('Manipal University Jaipur', opts('Manipal University', 'Amity University'))).toBeNull();
  });
});

describe('option-set detection', () => {
  it.each([
    [opts('Male', 'Female', 'Other'), 'gender'],
    [opts('Mr', 'Mrs', 'Ms', 'Dr'), 'salutation'],
    [opts('Single', 'Married', 'Divorced'), 'marital'],
    [opts('Select', 'India', 'Nepal', 'United States', 'Canada', 'France', 'Germany', 'Japan', 'China', 'Brazil'), 'country'],
    [opts('January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'), 'month'],
    [opts('2020', '2021', '2022', '2023', '2024', '2025'), 'year'],
    [opts('Yes', 'No'), 'yesno'],
    [opts('Fresher', '0-1 years', '1-3 years', '3-5 years'), 'experience'],
    [opts('+1 USA', '+44 UK', '+91 India', '+61 Australia', '+65 Singapore'), 'callingCode'],
  ])('%# → %s', (options, hint) => {
    expect(analyzeOptions(options)).toBe(hint);
  });
});

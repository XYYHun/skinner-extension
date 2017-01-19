/* extenal functions */

var add_domain_to_profile;
var remove_domain_from_profile;

var update_profile_table;

var get_options;
var set_options;

var get_profile_id;
var get_template_ids;

(function() /* Close */
{
  /* local variables */
  let profile_table = {};
  let template_table = {};

  let generated_style_cache = {};

  // TODO: consider use other storage mech.
  let storage_s = chrome.storage.sync || chrome.storage.local;
  let storage_l = chrome.storage.local;

  /* local functions */

  let get_generated_style;

  /* extenal functions */

  add_domain_to_profile = function(domain, profile_id)
  {
    if (profile_id == 'default')
      return;

    let profile_data = profile_table[profile_id];

    if (!profile_data)
    {
      profile_data = {matches:[]};
      profile_table[profile_id] = profile_data;
    }

    profile_data.matches.push({type: 'domain', value: domain});
  };

  remove_domain_from_profile = function(domain, profile_id)
  {
    let profile_data = profile_table[profile_id];

    if (profile_data && profile_data.matches)
    {
      let new_matches = []

      for (var index in profile_data.matches)
      {
        if (profile_data.matches[index].value != domain)
          new_matches.push(profile_data.matches[index])
      }

      profile_data.matches = new_matches;
    }
  };

  update_profile_table = function()
  {
    storage_s.set({'profile-table': profile_table});
  };

  get_options = function(profile_id, callback)
  {
    const options_id = 'options-' + profile_id;

    storage_s.get(options_id, function(data)
    {
      if (options_id in data)
        callback(data[options_id]);
      else
        callback({});
    });
  };

  set_options = function(profile_id, options)
  {
    const generated_style_pattern = /^generated-style:([\w\-]*):([\w\-]*)$/;

    let count = 0;

    for (let cached_style_id in generated_style_cache)
    {
      count++;

      cached_style_id.replace(generated_style_pattern, function(full_match, cached_profile_id, template_id)
      {
        if (cached_profile_id == profile_id)
        {
          let template_info = template_table[template_id];

          if (template_info.type == 'addon')
            $.get(template_info.url, function(template)
            {
              const generated_style_id = ['generated-style', profile_id, template_id].join(':');
              generated_style_cache[generated_style_id] = style_template.generate(template, options);

              count--;

              if (!count)
              {
                console.log('update options.');
                storage_s.set({['options-' + profile_id]: options});
              }
            }, "text");
        }
      })
    }
  };

  get_profile_id = function(url)
  {
    for (let profile_id in profile_table)
    {
      let profile = profile_table[profile_id];

      if (profile.matches)
        for (let index in profile.matches)
        {
          let match = profile.matches[index];
          let match_regexp;

          switch (match.type)
          {
          case 'domain':
            let domain;
            //TODO: new plan: url => domain, then compares.
            match_regexp = RegExp(
              '^https?:\\/\\/(?:[^\\/]*@)?(?:[^\\s\\/:]+\\.)*' +
              match.value.replace('.', '\\\.') + '(?::[\\d]*)?\\/.*');
            break;
          case 'regexp':
          default:
            match_regexp = RegExp(match.value);
            break;
          }

          if (match_regexp.test(url))
            return profile_id;
        }
    }

    return 'default';
  }

  get_template_ids = function(url)
  {
    result = []

    for (let id in template_table)
    {
      let template = template_table[id];

      if (template['match-regexp'] && (new RegExp(template['match-regexp'])).test(url))
        result.push(id);
    }

    return result;
  }

  get_generated_style = function(profile_id, template_id, callback, force_update)
  {
    if (profile_id == 'disabled')
      return;

    const generated_style_id = ['generated-style', profile_id, template_id].join(':');

    if ((generated_style_id in generated_style_cache) && !force_update)
    {
      if (callback)
        callback(generated_style_cache[generated_style_id]);
    }
    else
    {
      get_options(profile_id, function(options)
      {
        let template_info = template_table[template_id];

        if (template_info.type == 'addon')
          $.get(template_info.url, function(template)
          {
            generated_style_cache[generated_style_id] = style_template.generate(template, options);

            callback(generated_style_cache[generated_style_id]);
          }, "text");
      });
    }

    return generated_style_id;
  }

  /* initial */

  const storage_version = '0.1.3';

  storage_l.get(['initialled', 'storage-version'], function(data)
  {
    let to_set = {};

    if (!('initialled' in data))
    {
      to_set['enabled'] = true;
      to_set['initialled'] = true;
    }

    if (data['storage-version'] != storage_version)
    {
      to_set['storage-version'] = storage_version;

      // remove all styles cached in local storage.
      storage_l.get(null, function(data)
      {
        const generated_style_id_pattern = /^generated-style/;

        let to_remove = [];

        for (let key in data)
        {
          if (key.match(generated_style_id_pattern))
            to_remove.push(key);
        }

        storage_l.remove(to_remove);
      });
    }

    if (Object.keys(to_set).length)
      storage_l.set(to_set);
  });

  storage_s.get(['profile-table', 'template-table'], function(data)
  {
    profile_table = data['profile-table'] || {};

    template_table = data['template-table'] || {};
    
    if (!template_table['addon-google-plus'])
      template_table['addon-google-plus'] = {
        'type': 'addon',
        'url': './templates/google-plus.template.css',
        'match-regexp': '^https:\/\/plus\.google\.com\/',
      };

    if (!template_table['addon-facebook'])
      template_table['addon-facebook'] = {
        'type': 'addon',
        'url': './templates/facebook.template.css',
        'match-regexp': '^https?:\/\/(?:[\w\d]+\.)?facebook\.com\/',
      };

    if (!template_table['addon-twitter'])
      template_table['addon-twitter'] = {
        'type': 'addon',
        'url': './templates/twitter.template.css',
        'match-regexp': '^https?:\/\/(?:[\w\d]+\.)?twitter\.com\/',
      };
  });

  chrome.runtime.onMessage.addListener(
    function(request, sender, sendResponse)
    {
      let response = {};

      if (request['request-profile-id'])
        response['profile-id'] = get_profile_id(request.url);

      if (request['request-template-ids'])
        response['template-ids'] = get_template_ids(request.url);

      if (request['request-generated-style'])
      {
        for (let index in request['template-id-list'])
        {
          response['generated-style-id'] = get_generated_style(
            request['profile-id'],
            request['template-id-list'][index],
            function(style)
            {
              chrome.tabs.sendMessage(
                sender.tab.id,
                {
                  'response-generated-style' : true,
                  'index' : index,
                  'style' : style,
                });
            });
        }
      }

      sendResponse(response);
    });
})();
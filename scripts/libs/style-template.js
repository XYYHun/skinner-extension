var style_template = style_template || {};

(function()
{
  const selector_pattern = /\/\*(?:\?\s*(.*?)\s*\{|\s*(\})\s*)\*\//g;
  const selector_expression_pattern = /(\!?)([\w\-\_]+)(?:\s*\:\s*(?:\'((?:[^\\]|\\.)*?)\'|([\w\-\_]+|)))?/g

  const key_pattern = /\/\*\s*\$\s*([^\[\]]*?)\s*(?:\[\s*\*\/(.*?)\/\*\s*\])?\s*\*\//g;

  function evaluate(expression, keys)
  {
    phases = expression.split(',');

    for (let index in phases)
    {
      let phase_result = true;

      let evaluated = phases[index].replace(
        selector_expression_pattern,
        function(
          full_match, reversed, key,
          value_pattern_1,                    // match => key: 'an value'
          value_pattern_2)                    // match => key: value
        {
          if (!phase_result) return "";

          let value;

          if (value_pattern_1 !== undefined)
            value = value_pattern_1;
          else
            value = value_pattern_2;

          if (value === undefined)
          {
            phase_result = !reversed ? keys[key] : !keys[key];
          }
          else
          {
            if (value_pattern_1 !== undefined)
              phase_result = keys[key] === value;
            else
              phase_result = String(keys[key]) === value;

            phase_result = reversed ? !phase_result : phase_result;
          }

          return "";
        }
      );

      if ((evaluated.match(/^[\s]*$/) !== null) && phase_result)
        return true;
    }

    return false;
  }

  style_template.generate = function(template, keys)
  {
    let result = "";

    let selector_stack = [];
    let selector_failure = 0;

    let lines = template.split('\n');

    for (let index in lines)
    {
      let in_line = lines[index];
      let selector_line = false;

      in_line.replace(selector_pattern, function(full_match, expression, close_bracket)
      {
        if (expression)
        {
          selector_stack.push(evaluate(expression, keys));
          selector_failure += !selector_stack[selector_stack.length - 1];
        }

        if (close_bracket) {
          selector_failure -= !selector_stack.pop();
        }

        selector_line = true;
      });

      if (!selector_failure && !selector_line)
      {
        // Note: disable css hack?
        let out_line = in_line.replace(key_pattern, function(full_match, key, default_value)
        {
          if (key in keys)
            return keys[key];
          
          if (default_value !== undefined)
            return default_value;
        });

        result += out_line + '\n';
      }
    }

    return result;
  }
})();
